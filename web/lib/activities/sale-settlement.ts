import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventSale, saleSettlement } from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";
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

  const match = await findSaleBatchByGuideNumber(guideNumber);
  if (!match) {
    throw new Error(`No se encontró ninguna venta con la guía ${guideNumber}`);
  }

  await requireFarmAccess(userId, role, match.farmId);

  await db.transaction(async (tx) => {
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
      await tx
        .update(eventSale)
        .set(updates)
        .where(eq(eventSale.guideNumber, guideNumber));
    }
  });
}
