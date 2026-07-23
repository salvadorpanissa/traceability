import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventTransfer, paddock } from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { requireTransferAuthorization } from "@/lib/dal/animal-access";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import { createNewAnimal } from "@/lib/activities/animal-creation";

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
  if (
    rows.some(
      (row) => (row.status === "new" || (row.status === "foreign" && row.forced)) && row.pendingOwnerName
    )
  ) {
    throw new Error("El lote tiene propietarios pendientes de crear; no se puede confirmar");
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
      if (row.status === "foreign" && !row.forced) continue;

      let animalId: string;
      let originFarmId: string;
      let originPaddockId: string | null;

      if (row.status === "existing") {
        animalId = row.animalId;
        originFarmId = row.currentFarmId ?? operatingFarmId;
        originPaddockId = row.currentPaddockId;
      } else {
        animalId = await createNewAnimal(tx, {
          userId,
          operatingFarmId,
          batchId: batch.id,
          row,
        });
        originFarmId = operatingFarmId;
        originPaddockId = null;
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
          notes: row.notes,
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

    // animal_current_state used to refresh itself via an AFTER INSERT
    // trigger on every event/event_transfer row; for a batch of N rows that
    // meant N full-view refreshes. Refreshing once after the whole batch is
    // committed is equivalent (nothing reads the view mid-loop) and avoids
    // the O(n^2) cost that exhausted memory on large batches.
    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}
