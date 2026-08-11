import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventTransfer, paddock } from "@/db/schema";
import { requireEstablishmentAccess } from "@/lib/dal/farm-access";
import { requireTransferAuthorization } from "@/lib/dal/animal-access";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import { createNewAnimal } from "@/lib/activities/animal-creation";
import { gapFillBreed, gapFillSecondaryTag } from "@/lib/activities/gap-fill";

export { resolveBatchRows, type ResolvedRow };

export type GuideDocument = {
  fileName: string;
  mimeType: string;
  data: Buffer;
};

export async function confirmTransferBatch(input: {
  userId: string;
  role: string | undefined;
  operatingEstablishmentId: string;
  destinationEstablishmentId: string;
  destinationPaddockId: string | null;
  originEstablishmentId?: string;
  guideNumber?: string | null;
  guideDocument?: GuideDocument;
  rows: ResolvedRow[];
}): Promise<void> {
  const { userId, role, operatingEstablishmentId, destinationEstablishmentId, destinationPaddockId, rows } = input;
  const newAnimalOriginEstablishmentId = input.originEstablishmentId ?? operatingEstablishmentId;

  await requireEstablishmentAccess(userId, role, operatingEstablishmentId);
  await requireTransferAuthorization(userId, role, newAnimalOriginEstablishmentId, destinationEstablishmentId);

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
    if (!destinationPaddockRow || destinationPaddockRow.establishmentId !== destinationEstablishmentId) {
      throw new Error("El potrero destino no pertenece al campo destino");
    }
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        establishmentId: operatingEstablishmentId,
        animalCount: rows.length,
        createdBy: userId,
        guideFileName: input.guideDocument?.fileName ?? null,
        guideMimeType: input.guideDocument?.mimeType ?? null,
        guideFileData: input.guideDocument?.data ?? null,
      })
      .returning();

    for (const row of rows) {
      if (row.status === "error") continue;
      if (row.status === "foreign" && !row.forced) continue;

      let animalId: string;
      let originEstablishmentId: string;
      let originPaddockId: string | null;

      if (row.status === "existing") {
        animalId = row.animalId;
        await gapFillBreed(tx, animalId, row.breed);
        await gapFillSecondaryTag(tx, animalId, row.secondaryTag);
        originEstablishmentId = row.currentEstablishmentId ?? operatingEstablishmentId;
        originPaddockId = row.currentPaddockId;
      } else {
        animalId = await createNewAnimal(tx, {
          userId,
          operatingEstablishmentId,
          batchId: batch.id,
          row,
        });
        originEstablishmentId = newAnimalOriginEstablishmentId;
        originPaddockId = null;
      }

      const [createdEvent] = await tx
        .insert(event)
        .values({
          eventType: "transfer",
          eventDate: row.eventDate,
          animalId,
          establishmentId: operatingEstablishmentId,
          batchOperationId: batch.id,
          createdBy: userId,
          notes: row.notes,
        })
        .returning();

      await tx.insert(eventTransfer).values({
        eventId: createdEvent.id,
        originEstablishmentId,
        destinationEstablishmentId,
        originPaddockId,
        destinationPaddockId,
        guideNumber: input.guideNumber ?? null,
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
