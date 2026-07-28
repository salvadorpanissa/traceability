import { eq, inArray } from "drizzle-orm";
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

export async function findSaleBatchByGuideNumber(guideNumber: string): Promise<SaleBatchMatch | null> {
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
    .where(eq(eventSale.guideNumber, guideNumber));

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
