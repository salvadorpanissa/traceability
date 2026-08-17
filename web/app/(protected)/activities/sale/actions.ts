"use server";

import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess, getEstablishmentFarmId } from "@/lib/dal/farm-access";
import { requireFile } from "@/lib/dal/form-data";
import { resolveBatchRows, confirmSaleBatch, type ResolvedRow } from "@/lib/activities/sale";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { parseSnigGuide } from "@/lib/activities/snig-guide-parsing";
import { findEstablishmentByDicoseCode } from "@/lib/dal/dicose";
import { findPendingWithdrawals } from "@/lib/dal/health-withdrawal";
import { estimateBirthDateFromAge } from "@/lib/activities/date-normalization";
import type { MappedRow } from "@/lib/activities/column-mapping";

export type PdfPreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      guideNumber: string;
      eventDate: string;
      originEstablishmentId: string;
      originEstablishmentName: string;
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

  // Only the origin DICOSE is validated against registered establecimientos —
  // the destination DICOSE identifies the external buyer, which is never an
  // establecimiento tracked by this system, so it is intentionally not
  // looked up here.
  const origin = await findEstablishmentByDicoseCode(guide.originDicoseCode);
  if (!origin) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.originDicoseCode}` };
  }

  await requireEstablishmentAccess(session.user.id, session.user.role, origin.establishmentId);

  const mappedRows: MappedRow[] = guide.animals.map((a) => ({
    tag: a.tag,
    date: guide.eventDate,
    category: null,
    sex: a.sex,
    ownerName: null,
    notes: null,
    birthDate: a.ageMonths !== null ? estimateBirthDateFromAge(guide.eventDate, a.ageMonths) : null,
    reproductiveStatusId: null,
  }));

  const rows = await resolveBatchRows(mappedRows, guide.eventDate, origin.establishmentId);

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
    originEstablishmentId: origin.establishmentId,
    originEstablishmentName: origin.establishmentName,
    rows,
    withdrawalWarnings,
  };
}

export async function confirmSaleBatchFromPdfAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const originEstablishmentId = formData.get("originEstablishmentId") as string;
  await requireEstablishmentAccess(session.user.id, session.user.role, originEstablishmentId);

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
    operatingEstablishmentId: originEstablishmentId,
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

export async function createOwnerAction(establishmentId: string, name: string): Promise<OwnerCatalogEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  const farmId = await getEstablishmentFarmId(establishmentId);
  if (!farmId) throw new Error("Campo no encontrado");
  return createOwner(farmId, name);
}
