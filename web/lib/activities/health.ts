import { batchOperation, event, eventTransfer, eventHealth } from "@/db/schema";
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

export async function confirmHealthBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  products: HealthProduct[];
  rows: ResolvedRow[];
}): Promise<void> {
  const { userId, role, operatingFarmId, products, rows } = input;

  await requireFarmAccess(userId, role, operatingFarmId);

  if (products.length === 0) {
    throw new Error("Hay que elegir al menos un producto");
  }
  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }
  if (rows.some((row) => row.status === "new" && row.pendingOwnerName)) {
    throw new Error("El lote tiene propietarios pendientes de crear; no se puede confirmar");
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "health", farmId: operatingFarmId, animalCount: rows.length, createdBy: userId })
      .returning();

    for (const row of rows) {
      if (row.status === "error") continue;

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
        });
      }
    }
  });
}
