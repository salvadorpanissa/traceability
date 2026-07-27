import { sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventRecategorize } from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";

type PlannedChange = {
  animalId: string;
  farmId: string;
  eventDate: string;
  notes: string | null;
  oldCategoryId: string;
  newCategoryId: string;
  source: "manual" | "initial";
};

export async function confirmRecategorizeBatch(input: {
  userId: string;
  role: string | undefined;
  targetCategoryId: string;
  rows: RecategorizeResolvedRow[];
  unresolvableDecisions: Record<string, UnresolvableDecision>;
}): Promise<void> {
  const { userId, role, targetCategoryId, rows, unresolvableDecisions } = input;

  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }

  const plannedChanges: PlannedChange[] = [];
  for (const row of rows) {
    if (row.status === "existing") {
      if (row.currentCategoryId === targetCategoryId) continue;
      plannedChanges.push({
        animalId: row.animalId,
        farmId: row.currentFarmId,
        eventDate: row.eventDate,
        notes: row.notes,
        oldCategoryId: row.currentCategoryId,
        newCategoryId: targetCategoryId,
        source: "manual",
      });
    } else if (row.status === "age-resolved") {
      plannedChanges.push({
        animalId: row.animalId,
        farmId: row.currentFarmId,
        eventDate: row.eventDate,
        notes: row.notes,
        oldCategoryId: row.resolvedCategoryId,
        newCategoryId: row.resolvedCategoryId,
        source: "initial",
      });
    } else if (row.status === "age-unresolvable") {
      const decision = unresolvableDecisions[row.animalId] ?? "skip";
      if (decision === "skip") continue;
      plannedChanges.push({
        animalId: row.animalId,
        farmId: row.currentFarmId,
        eventDate: row.eventDate,
        notes: row.notes,
        oldCategoryId: targetCategoryId,
        newCategoryId: targetCategoryId,
        source: "initial",
      });
    }
  }

  if (plannedChanges.length === 0) {
    throw new Error("Ningún animal cambia de categoría; no se puede confirmar");
  }

  const involvedFarmIds = [...new Set(plannedChanges.map((c) => c.farmId))];
  for (const farmId of involvedFarmIds) {
    await requireFarmAccess(userId, role, farmId);
  }

  const changesByFarm = new Map<string, PlannedChange[]>();
  for (const change of plannedChanges) {
    const list = changesByFarm.get(change.farmId) ?? [];
    list.push(change);
    changesByFarm.set(change.farmId, list);
  }

  for (const [farmId, changes] of changesByFarm) {
    await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(batchOperation)
        .values({
          eventType: "recategorize",
          farmId,
          animalCount: changes.length,
          createdBy: userId,
        })
        .returning();

      for (const change of changes) {
        const [createdEvent] = await tx
          .insert(event)
          .values({
            eventType: "recategorize",
            eventDate: change.eventDate,
            animalId: change.animalId,
            farmId,
            batchOperationId: batch.id,
            createdBy: userId,
            notes: change.notes,
          })
          .returning();

        await tx.insert(eventRecategorize).values({
          eventId: createdEvent.id,
          oldCategoryId: change.oldCategoryId,
          newCategoryId: change.newCategoryId,
          source: change.source,
        });
      }
    });
  }

  await db.execute(sql`refresh materialized view concurrently animal_current_state`);
}
