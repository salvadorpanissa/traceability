"use server";

import { requireSession } from "@/lib/dal/session";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { requireFile } from "@/lib/dal/form-data";
import { resolveBatchRows, confirmSaleBatch, type ResolvedRow } from "@/lib/activities/sale";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { parseSnigGuide } from "@/lib/activities/snig-guide-parsing";
import { findFarmByDicoseCode } from "@/lib/dal/dicose-registration";
import { findPendingWithdrawals } from "@/lib/dal/health-withdrawal";
import { estimateBirthDateFromAge } from "@/lib/activities/date-normalization";
import type { MappedRow } from "@/lib/activities/column-mapping";

export type PdfPreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      guideNumber: string;
      eventDate: string;
      originFarmId: string;
      originFarmName: string;
      rows: ResolvedRow[];
      withdrawalWarnings: { tag: string; productName: string; restrictionEndDate: string }[];
    };

export async function previewSaleBatchFromPdf(formData: FormData): Promise<PdfPreviewResult> {
  const session = await requireSession();
  const file = requireFile(formData, "file");
  const buffer = await file.arrayBuffer();

  let guide;
  try {
    guide = await parseSnigGuide(buffer);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el PDF" };
  }

  // Only the origin DICOSE is validated against registered farms — the
  // destination DICOSE identifies the external buyer, which is never a farm
  // tracked by this system, so it is intentionally not looked up here.
  const origin = await findFarmByDicoseCode(guide.originDicoseCode);
  if (!origin) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.originDicoseCode}` };
  }

  await requireFarmAccess(session.user.id, session.user.role, origin.farmId);

  const mappedRows: MappedRow[] = guide.animals.map((a) => ({
    tag: a.tag,
    date: guide.eventDate,
    category: null,
    sex: a.sex,
    ownerName: null,
    notes: null,
    birthDate: a.ageMonths !== null ? estimateBirthDateFromAge(guide.eventDate, a.ageMonths) : null,
  }));

  const rows = await resolveBatchRows(mappedRows, guide.eventDate, origin.farmId);

  const existingRows = rows.filter(
    (row): row is Extract<ResolvedRow, { status: "existing" }> => row.status === "existing"
  );
  const existingAnimalIds = existingRows.map((row) => row.animalId);
  const tagByAnimalId = new Map(existingRows.map((row) => [row.animalId, row.tag]));
  const pendingWithdrawals = await findPendingWithdrawals(existingAnimalIds, guide.eventDate);
  const withdrawalWarnings = pendingWithdrawals.map((w) => ({
    tag: tagByAnimalId.get(w.animalId) ?? w.animalId,
    productName: w.productName,
    restrictionEndDate: w.restrictionEndDate,
  }));

  return {
    ok: true,
    guideNumber: guide.guideNumber,
    eventDate: guide.eventDate,
    originFarmId: origin.farmId,
    originFarmName: origin.farmName,
    rows,
    withdrawalWarnings,
  };
}

export async function confirmSaleBatchFromPdfAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const originFarmId = formData.get("originFarmId") as string;
  await requireFarmAccess(session.user.id, session.user.role, originFarmId);

  const file = requireFile(formData, "file");
  const rows = JSON.parse(formData.get("rows") as string) as ResolvedRow[];
  const forcedWithdrawalTags = JSON.parse(formData.get("forcedWithdrawalTags") as string) as string[];
  const buyer = (formData.get("buyer") as string | null) || null;
  const price = (formData.get("price") as string | null) || null;
  const weightKg = (formData.get("weightKg") as string | null) || null;

  // guide_number is the column the future liquidación-linking feature keys on —
  // a silently-NULL one would be unrecoverable after the fact.
  const guideNumber = (formData.get("guideNumber") as string | null) || null;
  if (!guideNumber) {
    throw new Error("Falta el número de guía; no se puede confirmar la venta");
  }

  await confirmSaleBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId: originFarmId,
    guideNumber,
    buyer,
    price,
    weightKg,
    rows,
    forcedWithdrawalTags,
    guideDocument: {
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      data: Buffer.from(await file.arrayBuffer()),
    },
  });
}

export async function createOwnerAction(name: string): Promise<OwnerCatalogEntry> {
  await requireSession();
  return createOwner(name);
}
