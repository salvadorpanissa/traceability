import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { event, eventSale, saleSettlement } from "@/db/schema";
import { isAdmin, requireFarmAccess, userFarmIds } from "@/lib/dal/farm-access";
import { findSaleBatchByGuideNumber } from "@/lib/dal/sale-batch";

export async function linkSaleSettlement(input: {
  userId: string;
  role: string | undefined;
  guideNumber: string;
  frigorifico: string;
  weighDate: string;
  totalAmount: string;
  weightKg: string | null;
  pricePerKg: string | null;
  guideDocument: { fileName: string; mimeType: string; data: Buffer };
}): Promise<void> {
  const { userId, role, guideNumber, frigorifico, weighDate, totalAmount, weightKg, pricePerKg, guideDocument } = input;

  const accessibleFarmIds = isAdmin(role) ? "all" : await userFarmIds(userId);

  const match = await findSaleBatchByGuideNumber(guideNumber, accessibleFarmIds);
  if (!match) {
    throw new Error(`No se encontró ninguna venta con la guía ${guideNumber}`);
  }

  // Redundant now that the search itself is scoped, but kept as defense in depth.
  await requireFarmAccess(userId, role, match.farmId);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ guideNumber: saleSettlement.guideNumber })
      .from(saleSettlement)
      .where(eq(saleSettlement.batchOperationId, match.batchOperationId));
    if (existing) {
      throw new Error(`Esta venta ya tiene una liquidación vinculada (guía ${existing.guideNumber})`);
    }

    await tx.insert(saleSettlement).values({
      batchOperationId: match.batchOperationId,
      guideNumber,
      frigorifico,
      weighDate,
      totalAmount,
      fileName: guideDocument.fileName,
      mimeType: guideDocument.mimeType,
      fileData: guideDocument.data,
      createdBy: userId,
    });

    const updates: Partial<{ buyer: string; price: string; weightKg: string }> = {};
    if (match.buyer === null) updates.buyer = frigorifico;
    if (match.price === null && pricePerKg !== null) updates.price = pricePerKg;
    if (match.weightKg === null && weightKg !== null) updates.weightKg = weightKg;

    if (Object.keys(updates).length > 0) {
      // Scoped to the batch we actually matched, not the raw guide number:
      // guide_number has no uniqueness constraint, so a same-guide venta created
      // elsewhere can never be touched by this update.
      await tx
        .update(eventSale)
        .set(updates)
        .where(
          inArray(
            eventSale.eventId,
            tx
              .select({ id: event.id })
              .from(event)
              .where(and(eq(event.eventType, "sale"), eq(event.batchOperationId, match.batchOperationId)))
          )
        );
    }
  });
}
