import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { event, eventSale, batchOperation, establishment, animalTagHistory } from "@/db/schema";

export type SaleBatchMatch = {
  batchOperationId: string;
  establishmentId: string;
  establishmentName: string;
  eventDate: string;
  animalTags: string[];
  buyer: string | null;
  price: string | null;
  weightKg: string | null;
};

// The search is always scoped to the establecimientos the caller can
// actually see: an admin passes "all", a manager passes their
// user_establishment ids. A venta at an establecimiento the caller has no
// access to is invisible to the query, so it returns the same null as a
// guide number that doesn't exist anywhere — no cross-establecimiento leak,
// and no two establecimientos locking each other out over a reused guide
// number.
export async function findSaleBatchByGuideNumber(
  guideNumber: string,
  accessibleEstablishmentIds: string[] | "all"
): Promise<SaleBatchMatch | null> {
  if (accessibleEstablishmentIds !== "all" && accessibleEstablishmentIds.length === 0) return null;

  const scope =
    accessibleEstablishmentIds === "all"
      ? eq(eventSale.guideNumber, guideNumber)
      : and(eq(eventSale.guideNumber, guideNumber), inArray(batchOperation.establishmentId, accessibleEstablishmentIds));

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
  const [establishmentRow] = await db.select().from(establishment).where(eq(establishment.id, batchRow.establishmentId));

  const animalIds = rows.map((r) => r.animalId);
  const tagRows = await db
    .select({ animalId: animalTagHistory.animalId, tag: animalTagHistory.tag })
    .from(animalTagHistory)
    .where(inArray(animalTagHistory.animalId, animalIds));
  const tagByAnimalId = new Map(tagRows.map((t) => [t.animalId, t.tag]));
  const animalTags = animalIds.map((id) => tagByAnimalId.get(id)).filter((t): t is string => t !== undefined);

  return {
    batchOperationId: rows[0].batchOperationId,
    establishmentId: batchRow.establishmentId,
    establishmentName: establishmentRow.name,
    eventDate: rows[0].eventDate,
    animalTags,
    buyer: rows[0].buyer,
    price: rows[0].price,
    weightKg: rows[0].weightKg,
  };
}
