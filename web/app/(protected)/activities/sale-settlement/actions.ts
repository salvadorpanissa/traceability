"use server";

import { requireSession } from "@/lib/dal/session";
import { parseCledinorSettlement } from "@/lib/activities/cledinor-settlement-parsing";
import { findSaleBatchByGuideNumber } from "@/lib/dal/sale-batch";
import { linkSaleSettlement } from "@/lib/activities/sale-settlement";

const FRIGORIFICO = "Cledinor S.A.";

export type SettlementPreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      guideNumber: string;
      weighDate: string;
      total: string;
      weightKg: string | null;
      pricePerKg: string | null;
      match: {
        farmName: string;
        eventDate: string;
        animalTags: string[];
        buyer: string | null;
        price: string | null;
        weightKg: string | null;
      };
    };

export async function previewSaleSettlement(formData: FormData): Promise<SettlementPreviewResult> {
  await requireSession();
  const file = formData.get("file") as File;
  const buffer = await file.arrayBuffer();

  let settlement;
  try {
    settlement = await parseCledinorSettlement(buffer);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el PDF" };
  }

  let match;
  try {
    match = await findSaleBatchByGuideNumber(settlement.guideNumber);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo buscar la venta" };
  }
  if (!match) {
    return { ok: false, error: `No se encontró ninguna venta con la guía ${settlement.guideNumber}` };
  }

  return {
    ok: true,
    guideNumber: settlement.guideNumber,
    weighDate: settlement.weighDate,
    total: settlement.total,
    weightKg: settlement.weightKg,
    pricePerKg: settlement.pricePerKg,
    match: {
      farmName: match.farmName,
      eventDate: match.eventDate,
      animalTags: match.animalTags,
      buyer: match.buyer,
      price: match.price,
      weightKg: match.weightKg,
    },
  };
}

export async function linkSaleSettlementAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const file = formData.get("file") as File;
  const buffer = await file.arrayBuffer();

  const settlement = await parseCledinorSettlement(buffer);

  await linkSaleSettlement({
    userId: session.user.id,
    role: session.user.role,
    guideNumber: settlement.guideNumber,
    frigorifico: FRIGORIFICO,
    weighDate: settlement.weighDate,
    totalAmount: settlement.total,
    weightKg: settlement.weightKg,
    pricePerKg: settlement.pricePerKg,
    guideDocument: {
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      data: Buffer.from(buffer),
    },
  });
}
