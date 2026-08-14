import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, category, event, eventRecategorize } from "@/db/schema";
import { getEstablishmentFarmId } from "@/lib/dal/farm-access";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// A one-animal recategorize event, fired when someone edits an animal's
// category directly from the Animales list — same event shape the bulk
// Recategorización activity writes (see confirmRecategorizeBatch), just for
// a single caravana. Recorded with source "manual" so the scheduled
// age-based job leaves this animal's category alone afterward (see the
// column comment on event_recategorize.source).
export async function confirmSingleRecategorize(input: {
  userId: string;
  animalId: string;
  establishmentId: string;
  oldCategoryId: string | null;
  newCategoryId: string;
}): Promise<void> {
  const { userId, animalId, establishmentId, oldCategoryId, newCategoryId } = input;

  const [categoryRow] = await db.select({ farmId: category.farmId }).from(category).where(eq(category.id, newCategoryId));
  const establishmentFarmId = await getEstablishmentFarmId(establishmentId);
  if (!categoryRow || categoryRow.farmId !== establishmentFarmId) {
    throw new Error("La categoría no pertenece al campo de este animal");
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "recategorize", establishmentId, animalCount: 1, createdBy: userId })
      .returning();

    const [recategorizeEvent] = await tx
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: today(),
        animalId,
        establishmentId,
        batchOperationId: batch.id,
        createdBy: userId,
      })
      .returning();

    // No prior category — a first-time assignment, same as the bulk
    // activity's "initial" branch. The column is NOT NULL, so it's
    // self-referential rather than left empty.
    await tx.insert(eventRecategorize).values({
      eventId: recategorizeEvent.id,
      oldCategoryId: oldCategoryId ?? newCategoryId,
      newCategoryId,
      source: oldCategoryId ? "manual" : "initial",
    });

    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}
