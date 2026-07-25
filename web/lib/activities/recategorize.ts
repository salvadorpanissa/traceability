import { sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventRecategorize } from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import type { RecategorizeResolvedRow } from "@/lib/activities/recategorize-resolution";

export async function confirmRecategorizeBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  targetCategoryId: string;
  rows: RecategorizeResolvedRow[];
}): Promise<void> {
  const { userId, role, operatingFarmId, targetCategoryId, rows } = input;

  await requireFarmAccess(userId, role, operatingFarmId);

  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }

  const changingRows = rows.filter(
    (row): row is Extract<RecategorizeResolvedRow, { status: "existing" }> =>
      row.status === "existing" && row.currentCategoryId !== targetCategoryId
  );
  if (changingRows.length === 0) {
    throw new Error("Ningún animal cambia de categoría; no se puede confirmar");
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({
        eventType: "recategorize",
        farmId: operatingFarmId,
        animalCount: changingRows.length,
        createdBy: userId,
      })
      .returning();

    for (const row of changingRows) {
      const [createdEvent] = await tx
        .insert(event)
        .values({
          eventType: "recategorize",
          eventDate: row.eventDate,
          animalId: row.animalId,
          farmId: operatingFarmId,
          batchOperationId: batch.id,
          createdBy: userId,
          notes: row.notes,
        })
        .returning();

      await tx.insert(eventRecategorize).values({
        eventId: createdEvent.id,
        oldCategoryId: row.currentCategoryId,
        newCategoryId: targetCategoryId,
        source: "manual",
      });
    }

    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}
