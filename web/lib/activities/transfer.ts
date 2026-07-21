import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animal, animalTagHistory, batchOperation, event, eventTransfer, eventRetag, eventRecategorize, paddock } from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { requireTransferAuthorization } from "@/lib/dal/animal-access";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";

export { resolveBatchRows, type ResolvedRow };

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
