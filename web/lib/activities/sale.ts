import { sql } from "drizzle-orm";
import { batchOperation, event, eventTransfer, eventSale } from "@/db/schema";
import { db } from "@/db";
import { requireEstablishmentAccess } from "@/lib/dal/farm-access";
import { createNewAnimal } from "@/lib/activities/animal-creation";
import { gapFillBreed, gapFillSecondaryTag } from "@/lib/activities/gap-fill";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import { findPendingWithdrawals } from "@/lib/dal/health-withdrawal";

export { resolveBatchRows, type ResolvedRow };

export type GuideDocument = {
  fileName: string;
  mimeType: string;
  data: Buffer;
};

export async function confirmSaleBatch(input: {
  userId: string;
  role: string | undefined;
  operatingEstablishmentId: string;
  guideNumber: string;
  buyer: string | null;
  price: string | null;
  weightKg: string | null;
  rows: ResolvedRow[];
  forcedWithdrawalTags: string[];
  guideDocument?: GuideDocument;
}): Promise<void> {
  const { userId, role, operatingEstablishmentId, guideNumber, buyer, price, weightKg, rows, forcedWithdrawalTags } = input;

  await requireEstablishmentAccess(userId, role, operatingEstablishmentId);

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

  // An "existing" row is any alive animal in the system with that caravana —
  // resolveBatchRows does not scope that lookup by campo. Selling an animal
  // that is currently standing at a different campo would permanently mark
  // another campo's animal as sold, from a campo the user may have no access
  // to at all.
  const misplaced = rows.find(
    (row): row is Extract<ResolvedRow, { status: "existing" }> =>
      row.status === "existing" && row.currentEstablishmentId !== operatingEstablishmentId
  );
  if (misplaced) {
    throw new Error(`La caravana ${misplaced.tag} figura en otro campo; no se puede vender desde acá`);
  }

  // Server-side re-check: the client's decision to force a caravana past its
  // withdrawal period is only trusted for tags it actually flagged — recompute
  // here instead of accepting whatever the browser claims was pending.
  // The reference date comes from the rows themselves so it can never diverge
  // from the dates actually written to the sale events below.
  const asOfDate = rows.find((r) => r.eventDate)?.eventDate ?? new Date().toISOString().slice(0, 10);
  const existingAnimalIds = rows
    .filter((row): row is Extract<ResolvedRow, { status: "existing" }> => row.status === "existing")
    .map((row) => row.animalId);
  const pendingWithdrawals = await findPendingWithdrawals(existingAnimalIds, asOfDate);
  if (pendingWithdrawals.length > 0) {
    const animalIdToTag = new Map(
      rows
        .filter((row): row is Extract<ResolvedRow, { status: "existing" }> => row.status === "existing")
        .map((row) => [row.animalId, row.tag])
    );
    const forcedSet = new Set(forcedWithdrawalTags);
    const unforced = pendingWithdrawals.filter((w) => {
      const tag = animalIdToTag.get(w.animalId);
      return tag !== undefined && !forcedSet.has(tag);
    });
    if (unforced.length > 0) {
      throw new Error("Hay caravanas con carencia de sanidad pendiente sin forzar; no se puede confirmar la venta");
    }
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({
        eventType: "sale",
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

      if (row.status === "existing") {
        animalId = row.animalId;
        await gapFillBreed(tx, animalId, row.breed);
        await gapFillSecondaryTag(tx, animalId, row.secondaryTag);
      } else {
        animalId = await createNewAnimal(tx, { userId, operatingEstablishmentId, batchId: batch.id, row });

        // A brand-new animal still needs a placement traslado to be visible in
        // animal_current_state (current_establishment_id only ever comes from
        // event_transfer) — same reasoning as confirmHealthBatch.
        const [placementEvent] = await tx
          .insert(event)
          .values({
            eventType: "transfer",
            eventDate: row.eventDate,
            animalId,
            establishmentId: operatingEstablishmentId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventTransfer).values({
          eventId: placementEvent.id,
          originEstablishmentId: operatingEstablishmentId,
          destinationEstablishmentId: operatingEstablishmentId,
          originPaddockId: null,
          destinationPaddockId: null,
        });
      }

      const [saleEvent] = await tx
        .insert(event)
        .values({
          eventType: "sale",
          eventDate: row.eventDate,
          animalId,
          establishmentId: operatingEstablishmentId,
          batchOperationId: batch.id,
          createdBy: userId,
          notes: row.notes,
        })
        .returning();

      await tx.insert(eventSale).values({
        eventId: saleEvent.id,
        buyer,
        price,
        weightKg,
        guideNumber,
      });
    }

    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}
