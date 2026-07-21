import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  animal,
  animalTagHistory,
  category,
  batchOperation,
  event,
  eventTransfer,
  eventRetag,
  eventRecategorize,
  paddock,
} from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { requireTransferAuthorization } from "@/lib/dal/animal-access";

export type ResolvedRow = { tag: string; eventDate: string } & (
  | { status: "existing"; animalId: string; currentFarmId: string | null; currentPaddockId: string | null }
  | { status: "new"; categoryId: string | null }
  | { status: "error"; reason: string }
);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveEventDate(rowDate: string | null, formEventDate: string): string {
  return rowDate && ISO_DATE.test(rowDate) ? rowDate : formEventDate;
}

type CurrentStateRow = { current_farm_id: string | null; current_paddock_id: string | null; status: string };

export async function resolveBatchRows(rows: MappedRow[], formEventDate: string): Promise<ResolvedRow[]> {
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
  }

  const nonEmptyTags = rows.map((r) => r.tag).filter((tag) => tag.length > 0);
  const tagHistoryRows =
    nonEmptyTags.length > 0
      ? await db
          .select({ tag: animalTagHistory.tag, animalId: animalTagHistory.animalId })
          .from(animalTagHistory)
          .where(inArray(animalTagHistory.tag, nonEmptyTags))
      : [];
  const animalIdByTag = new Map(tagHistoryRows.map((r) => [r.tag, r.animalId]));

  const categoryRows = await db.select({ id: category.id, name: category.name }).from(category);
  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

  const result: ResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);

    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }

    const animalId = animalIdByTag.get(row.tag);
    if (animalId) {
      const stateResult = await db.execute<CurrentStateRow>(
        sql`select current_farm_id, current_paddock_id, status from animal_current_state where animal_id = ${animalId}`
      );
      const state = stateResult.rows[0];
      if (state && state.status !== "alive") {
        result.push({ tag: row.tag, eventDate, status: "error", reason: "El animal está vendido o muerto" });
        continue;
      }
      result.push({
        tag: row.tag,
        eventDate,
        status: "existing",
        animalId,
        currentFarmId: state?.current_farm_id ?? null,
        currentPaddockId: state?.current_paddock_id ?? null,
      });
      continue;
    }

    if (row.category) {
      const categoryId = categoryIdByName.get(row.category);
      if (!categoryId) {
        result.push({ tag: row.tag, eventDate, status: "error", reason: "Categoría no reconocida" });
        continue;
      }
      result.push({ tag: row.tag, eventDate, status: "new", categoryId });
      continue;
    }

    result.push({ tag: row.tag, eventDate, status: "new", categoryId: null });
  }

  return result;
}

export async function confirmTransferBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  destinationFarmId: string;
  destinationPaddockId: string | null;
  rows: ResolvedRow[];
}): Promise<void> {
  const { userId, role, operatingFarmId, destinationFarmId, destinationPaddockId, rows } = input;

  await requireFarmAccess(userId, role, operatingFarmId);
  requireTransferAuthorization(role, operatingFarmId, destinationFarmId);

  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }

  if (destinationPaddockId) {
    const [destinationPaddockRow] = await db.select().from(paddock).where(eq(paddock.id, destinationPaddockId));
    if (!destinationPaddockRow || destinationPaddockRow.farmId !== destinationFarmId) {
      throw new Error("El potrero destino no pertenece al campo destino");
    }
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: operatingFarmId, animalCount: rows.length, createdBy: userId })
      .returning();

    for (const row of rows) {
      if (row.status === "error") continue;

      let animalId: string;
      let originFarmId: string;
      let originPaddockId: string | null;

      if (row.status === "existing") {
        animalId = row.animalId;
        originFarmId = row.currentFarmId ?? operatingFarmId;
        originPaddockId = row.currentPaddockId;
      } else {
        const [createdAnimal] = await tx.insert(animal).values({}).returning();
        await tx.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: row.tag });
        animalId = createdAnimal.id;
        originFarmId = operatingFarmId;
        originPaddockId = null;

        // Self-retag: establishes the new animal's current_tag in the derived
        // state view, which only reflects the *last event_retag*, not
        // animal_tag_history directly.
        const [retagEvent] = await tx
          .insert(event)
          .values({
            eventType: "retag",
            eventDate: row.eventDate,
            animalId,
            farmId: operatingFarmId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: row.tag, newTag: row.tag });

        // Self-recategorize: only when the Excel row carried an initial
        // category — an animal with none stays uncategorized until a real
        // recategorize event is loaded later.
        if (row.categoryId) {
          const [recategorizeEvent] = await tx
            .insert(event)
            .values({
              eventType: "recategorize",
              eventDate: row.eventDate,
              animalId,
              farmId: operatingFarmId,
              batchOperationId: batch.id,
              createdBy: userId,
            })
            .returning();
          await tx
            .insert(eventRecategorize)
            .values({ eventId: recategorizeEvent.id, oldCategoryId: row.categoryId, newCategoryId: row.categoryId });
        }
      }

      const [createdEvent] = await tx
        .insert(event)
        .values({
          eventType: "transfer",
          eventDate: row.eventDate,
          animalId,
          farmId: operatingFarmId,
          batchOperationId: batch.id,
          createdBy: userId,
        })
        .returning();

      await tx.insert(eventTransfer).values({
        eventId: createdEvent.id,
        originFarmId,
        destinationFarmId,
        originPaddockId,
        destinationPaddockId,
      });
    }
  });
}
