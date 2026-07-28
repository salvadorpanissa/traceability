import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { event, eventSale, batchOperation, farm, animalTagHistory } from "@/db/schema";

export type SaleBatchMatch = {
  batchOperationId: string;
  farmId: string;
  farmName: string;
  eventDate: string;
  animalTags: string[];
  buyer: string | null;
  price: string | null;
  weightKg: string | null;
};

// The search is always scoped to the campos the caller can actually see: an
// admin passes "all", a manager passes their user_farm ids. A venta at a campo
// the caller has no access to is invisible to the query, so it returns the same
// null as a guide number that doesn't exist anywhere — no cross-campo leak, and
// no two campos locking each other out over a reused guide number.
export async function findSaleBatchByGuideNumber(
  guideNumber: string,
  accessibleFarmIds: string[] | "all"
): Promise<SaleBatchMatch | null> {
  if (accessibleFarmIds !== "all" && accessibleFarmIds.length === 0) return null;

  const scope =
    accessibleFarmIds === "all"
      ? eq(eventSale.guideNumber, guideNumber)
      : and(eq(eventSale.guideNumber, guideNumber), inArray(batchOperation.farmId, accessibleFarmIds));

  const rows = await db
    .select({
      batchOperationId: event.batchOperationId,
      eventDate: event.eventDate,
      animalId: event.animalId,
      buyer: eventSale.buyer,
      price: eventSale.price,
      weightKg: eventSale.weightKg,
    })
    .from(eventSale)
    .innerJoin(event, eq(event.id, eventSale.eventId))
    .innerJoin(batchOperation, eq(batchOperation.id, event.batchOperationId))
    .where(scope);

  if (rows.length === 0) return null;

  const distinctBatchIds = new Set(rows.map((r) => r.batchOperationId));
  if (distinctBatchIds.size > 1) {
    throw new Error(`Hay más de una venta con la guía ${guideNumber}; revisar antes de vincular`);
  }

  const [batchRow] = await db.select().from(batchOperation).where(eq(batchOperation.id, rows[0].batchOperationId));
  const [farmRow] = await db.select().from(farm).where(eq(farm.id, batchRow.farmId));

  const animalIds = rows.map((r) => r.animalId);
  const tagRows = await db
    .select({ animalId: animalTagHistory.animalId, tag: animalTagHistory.tag })
    .from(animalTagHistory)
    .where(inArray(animalTagHistory.animalId, animalIds));
  const tagByAnimalId = new Map(tagRows.map((t) => [t.animalId, t.tag]));
  const animalTags = animalIds.map((id) => tagByAnimalId.get(id)).filter((t): t is string => t !== undefined);

  return {
    batchOperationId: rows[0].batchOperationId,
    farmId: batchRow.farmId,
    farmName: farmRow.name,
    eventDate: rows[0].eventDate,
    animalTags,
    buyer: rows[0].buyer,
    price: rows[0].price,
    weightKg: rows[0].weightKg,
  };
}
