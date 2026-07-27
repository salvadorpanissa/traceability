import { eq, sql } from "drizzle-orm";
import { batchOperation, event, eventTransfer, eventHealth, paddock } from "@/db/schema";
import { db } from "@/db";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { createNewAnimal } from "@/lib/activities/animal-creation";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

export type HealthProduct = {
  productId: string;
  dose: string;
  doseUnit: string;
  route: string;
  withdrawalDays: number | null;
  notes: string | null;
};

export type PaddockMismatch = { tag: string; currentPaddockId: string };

// Only same-farm mismatches are eligible: an "existing" row can resolve to an
// animal that currently lives at a *different* farm, and relocating it from
// here would bypass the cross-farm authorization the real traslado flow
// enforces (see requireTransferAuthorization in lib/activities/transfer.ts).
function isSameFarmMismatch(
  row: ResolvedRow,
  paddockId: string,
  operatingFarmId: string
): row is Extract<ResolvedRow, { status: "existing" }> & { currentPaddockId: string } {
  return (
    row.status === "existing" &&
    row.currentFarmId === operatingFarmId &&
    !!row.currentPaddockId &&
    row.currentPaddockId !== paddockId
  );
}

export function findPaddockMismatches(
  rows: ResolvedRow[],
  paddockId: string | null,
  operatingFarmId: string
): PaddockMismatch[] {
  if (!paddockId) return [];
  const mismatches: PaddockMismatch[] = [];
  for (const row of rows) {
    if (!isSameFarmMismatch(row, paddockId, operatingFarmId)) continue;
    mismatches.push({ tag: row.tag, currentPaddockId: row.currentPaddockId });
  }
  return mismatches;
}

export async function confirmHealthBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  products: HealthProduct[];
  rows: ResolvedRow[];
  paddockId: string | null;
  transferMismatchedToPaddock?: boolean;
}): Promise<void> {
  const {
    userId,
    role,
    operatingFarmId,
    products,
    rows,
    paddockId,
    transferMismatchedToPaddock = false,
  } = input;

  await requireFarmAccess(userId, role, operatingFarmId);

  if (products.length === 0) {
    throw new Error("Hay que elegir al menos un producto");
  }
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
  if (paddockId) {
    const [paddockRow] = await db.select().from(paddock).where(eq(paddock.id, paddockId));
    if (!paddockRow || paddockRow.farmId !== operatingFarmId) {
      throw new Error("El potrero no pertenece al campo activo");
    }
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "health", farmId: operatingFarmId, animalCount: rows.length, createdBy: userId })
      .returning();

    for (const row of rows) {
      if (row.status === "error") continue;
      if (row.status === "foreign" && !row.forced) continue;

      let animalId: string;

      if (row.status === "existing") {
        animalId = row.animalId;
      } else {
        animalId = await createNewAnimal(tx, { userId, operatingFarmId, batchId: batch.id, row });

        // Sanidad doesn't relocate animals, but a brand-new one still needs a
        // transfer event to be visible in animal_current_state (which only
        // derives current_farm_id from event_transfer) — this places it at
        // the farm it was loaded from, origin = destination.
        const [placementEvent] = await tx
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
          eventId: placementEvent.id,
          originFarmId: operatingFarmId,
          destinationFarmId: operatingFarmId,
          originPaddockId: null,
          destinationPaddockId: null,
        });
      }

      for (const healthProduct of products) {
        const [healthEvent] = await tx
          .insert(event)
          .values({
            eventType: "health",
            eventDate: row.eventDate,
            animalId,
            farmId: operatingFarmId,
            batchOperationId: batch.id,
            createdBy: userId,
            notes: row.notes,
          })
          .returning();

        await tx.insert(eventHealth).values({
          eventId: healthEvent.id,
          productId: healthProduct.productId,
          dose: healthProduct.dose,
          doseUnit: healthProduct.doseUnit,
          route: healthProduct.route,
          withdrawalDays: healthProduct.withdrawalDays,
          notes: healthProduct.notes,
          paddockId,
        });
      }
    }

    // Sanidad doesn't relocate animals on its own, but the user can opt into
    // also moving any existing animal whose current potrero differs from
    // the one the sanidad was performed in — same batch, same transaction.
    if (transferMismatchedToPaddock && paddockId) {
      // The traslado records when the physical relocation happens (now), not
      // when the historical sanidad took place — a backdated eventDate would
      // lose to the animal's latest real transfer in animal_current_state and
      // silently move nothing.
      const relocationDate = new Date().toISOString().slice(0, 10);
      for (const row of rows) {
        if (!isSameFarmMismatch(row, paddockId, operatingFarmId)) continue;
        const [transferEvent] = await tx
          .insert(event)
          .values({
            eventType: "transfer",
            eventDate: relocationDate,
            animalId: row.animalId,
            farmId: operatingFarmId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventTransfer).values({
          eventId: transferEvent.id,
          originFarmId: operatingFarmId,
          destinationFarmId: operatingFarmId,
          originPaddockId: row.currentPaddockId,
          destinationPaddockId: paddockId,
        });
      }
    }

    // See the equivalent comment in transfer.ts: this replaces N per-row
    // AFTER INSERT refreshes with a single refresh after the whole batch.
    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}
