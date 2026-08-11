import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, batchOperation, event, eventRecategorize } from "@/db/schema";
import { setCategoryActive } from "@/lib/dal/category-catalog";

// Caps how many animals go into a single batch_operation/transaction — a
// category can hold hundreds of currently-alive animals (e.g. "Ternera"),
// and moving them all in one transaction risks a long-running, all-or-
// nothing write. Chunked, each slice commits independently.
const CHUNK_SIZE = 200;

type CandidateAnimal = { animal_id: string; farm_id: string };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Moves every currently-alive animal out of `categoryId` and into
// `targetCategoryId` (one real recategorize event per animal, source
// 'manual' since a human triggered this, not the scheduled age job), then
// archives the category. Grouped by farm and chunked within each farm so a
// category with hundreds of animals doesn't become one giant transaction.
// Any failure aborts before the category is archived — a partial move would
// leave animals sitting in a category no longer offered anywhere.
export async function archiveCategory(input: {
  userId: string;
  categoryId: string;
  // Only required when the category actually has alive animals in it — a
  // category with none can be archived directly, with nothing to reassign.
  targetCategoryId: string | null;
}): Promise<{ reassigned: number }> {
  const { userId, categoryId, targetCategoryId } = input;

  const result = await db.execute<CandidateAnimal>(sql`
    select acs.animal_id, acs.current_farm_id as farm_id
    from animal_current_state acs
    where acs.status = 'alive' and acs.current_category_id = ${categoryId} and acs.current_farm_id is not null
  `);

  if (result.rows.length > 0) {
    if (!targetCategoryId) throw new Error("Elegí a qué categoría pasar los animales");
    if (categoryId === targetCategoryId) {
      throw new Error("La categoría destino no puede ser la misma que se está archivando");
    }
    const [source] = await db.select().from(category).where(eq(category.id, categoryId));
    const [target] = await db.select().from(category).where(eq(category.id, targetCategoryId));
    if (!target) throw new Error("La categoría destino no existe");
    if (!target.active) throw new Error("La categoría destino está archivada");
    if (!source || target.groupId !== source.groupId) {
      throw new Error("La categoría destino tiene que ser del mismo grupo de campos");
    }
  }

  const byFarm = new Map<string, string[]>();
  for (const row of result.rows) {
    const list = byFarm.get(row.farm_id) ?? [];
    list.push(row.animal_id);
    byFarm.set(row.farm_id, list);
  }

  // Validated above: byFarm is only non-empty when targetCategoryId passed
  // the "required and valid" checks, so it's never null by the time it's
  // actually used below.
  const resolvedTargetCategoryId = targetCategoryId as string;
  const eventDate = new Date().toISOString().slice(0, 10);
  let reassigned = 0;

  for (const [farmId, animalIds] of byFarm) {
    for (const batchAnimalIds of chunk(animalIds, CHUNK_SIZE)) {
      await db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(batchOperation)
          .values({ eventType: "recategorize", farmId, animalCount: batchAnimalIds.length, createdBy: userId })
          .returning();

        for (const animalId of batchAnimalIds) {
          const [createdEvent] = await tx
            .insert(event)
            .values({
              eventType: "recategorize",
              eventDate,
              animalId,
              farmId,
              batchOperationId: batch.id,
              createdBy: userId,
            })
            .returning();
          await tx.insert(eventRecategorize).values({
            eventId: createdEvent.id,
            oldCategoryId: categoryId,
            newCategoryId: resolvedTargetCategoryId,
            source: "manual",
          });
        }
      });
      reassigned += batchAnimalIds.length;
    }
  }

  await db.execute(sql`refresh materialized view concurrently animal_current_state`);
  await setCategoryActive(categoryId, false);

  return { reassigned };
}
