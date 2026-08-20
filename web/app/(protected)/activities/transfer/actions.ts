"use server";

import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolveBatchRows, confirmTransferBatch, type ResolvedRow } from "@/lib/activities/transfer";
import { confirmSaleBatch } from "@/lib/activities/sale";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { listPaddocksByEstablishment, createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { requireEstablishmentAccess, getEstablishmentFarmId } from "@/lib/dal/farm-access";
import { parseSnigGuide } from "@/lib/activities/snig-guide-parsing";
import { findEstablishmentByDicoseCode } from "@/lib/dal/dicose";
import { findPendingWithdrawals } from "@/lib/dal/health-withdrawal";
import { estimateBirthDateFromAge } from "@/lib/activities/date-normalization";
import type { MappedRow } from "@/lib/activities/column-mapping";
import { rememberedInitialMapping, rememberColumnMeanings } from "@/lib/dal/column-header-meaning";

export type PreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | { mappingNeeded: false; eventDateNeeded: true; mapping: ColumnMapping[] }
  | {
      mappingNeeded: false;
      eventDateNeeded: false;
      mapping: ColumnMapping[];
      rows: ResolvedRow[];
    };

export async function previewTransferBatch(formData: FormData): Promise<PreviewResult> {
  const session = await requireSession();
  const operatingEstablishmentId = formData.get("establishmentId") as string;
  await requireEstablishmentAccess(session.user.id, session.user.role, operatingEstablishmentId);

  const file = requireFile(formData, "file");
  const eventDateInput = formData.get("eventDate") as string | null;
  const eventDate = eventDateInput && eventDateInput.length > 0 ? eventDateInput : null;
  const mappingOverride = formData.get("mapping") as string | null;

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);

  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    return { mappingNeeded: true, headers, initialMapping: await rememberedInitialMapping(headers) };
  }

  const hasDateColumn = mapping.some((m) => m.meaning === "date");
  if (!hasDateColumn && !eventDate) {
    return { mappingNeeded: false, eventDateNeeded: true, mapping };
  }

  const mappedRows = applyColumnMapping(headers, rows, mapping);
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingEstablishmentId, {
    autoForceForeignWithoutOwner: true,
  });

  return { mappingNeeded: false, eventDateNeeded: false, mapping, rows: resolvedRows };
}

export async function confirmTransferBatchAction(input: {
  mapping: ColumnMapping[];
  destinationEstablishmentId: string;
  destinationPaddockId: string | null;
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.destinationEstablishmentId);

  await rememberColumnMeanings(input.mapping);

  // Rows for animals already tracked keep their real current location
  // (resolveBatchRows/confirmTransferBatch derive it from animal_current_state);
  // this only stands in as the batch's own establecimiento and as the
  // placement establecimiento for rows with no known location yet
  // (new/foreign) — there's no separate "origin" to ask for since the
  // destination is already what's being marked.
  await confirmTransferBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingEstablishmentId: input.destinationEstablishmentId,
    destinationEstablishmentId: input.destinationEstablishmentId,
    destinationPaddockId: input.destinationPaddockId,
    rows: input.rows,
  });
}

// A SNIG guide doesn't say "venta" or "traslado" anywhere in it — that's
// inferred here from whether the destination DICOSE resolves to an
// establecimiento the user has access to. If it does, animals are moving
// within the system (traslado); if it doesn't, the destination is an
// external buyer (venta).
export type GuidePreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      kind: "transfer";
      guideNumber: string;
      eventDate: string;
      originEstablishmentId: string;
      originEstablishmentName: string;
      destinationEstablishmentId: string;
      destinationEstablishmentName: string;
      rows: ResolvedRow[];
    }
  | {
      ok: true;
      kind: "sale";
      guideNumber: string;
      eventDate: string;
      originEstablishmentId: string;
      originEstablishmentName: string;
      rows: ResolvedRow[];
      withdrawalWarnings: { tag: string; productName: string; restrictionEndDate: string }[];
    };

export async function previewGuideAction(formData: FormData): Promise<GuidePreviewResult> {
  const session = await requireSession();
  const file = requireFile(formData, "file");
  const buffer = await file.arrayBuffer();

  let guide;
  try {
    guide = await parseSnigGuide(buffer);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el PDF" };
  }

  const origin = await findEstablishmentByDicoseCode(guide.originDicoseCode, session.user.id, session.user.role);
  if (!origin) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.originDicoseCode}` };
  }

  const destination = await findEstablishmentByDicoseCode(
    guide.destinationDicoseCode,
    session.user.id,
    session.user.role
  );

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

  if (destination) {
    await requireEstablishmentAccess(session.user.id, session.user.role, destination.establishmentId);
    const rows = await resolveBatchRows(mappedRows, guide.eventDate, destination.establishmentId, {
      autoForceForeignWithoutOwner: true,
    });
    return {
      ok: true,
      kind: "transfer",
      guideNumber: guide.guideNumber,
      eventDate: guide.eventDate,
      originEstablishmentId: origin.establishmentId,
      originEstablishmentName: origin.establishmentName,
      destinationEstablishmentId: destination.establishmentId,
      destinationEstablishmentName: destination.establishmentName,
      rows,
    };
  }

  await requireEstablishmentAccess(session.user.id, session.user.role, origin.establishmentId);
  const rows = await resolveBatchRows(mappedRows, guide.eventDate, origin.establishmentId);
  const existingRows = rows.filter(
    (row): row is Extract<ResolvedRow, { status: "existing" }> => row.status === "existing"
  );
  const tagByAnimalId = new Map(existingRows.map((row) => [row.animalId, row.tag]));
  const pendingWithdrawals = await findPendingWithdrawals(
    existingRows.map((row) => row.animalId),
    guide.eventDate
  );
  const withdrawalWarnings = pendingWithdrawals.map((w) => ({
    tag: tagByAnimalId.get(w.animalId) ?? w.animalId,
    productName: w.productName,
    restrictionEndDate: w.restrictionEndDate,
  }));

  return {
    ok: true,
    kind: "sale",
    guideNumber: guide.guideNumber,
    eventDate: guide.eventDate,
    originEstablishmentId: origin.establishmentId,
    originEstablishmentName: origin.establishmentName,
    rows,
    withdrawalWarnings,
  };
}

// Takes FormData (not a plain object) so the original uploaded PDF — kept in
// the form's state since the upload step — can travel alongside the other
// fields; the file is persisted on the batch as the guide's source document.
export async function confirmGuideAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const kind = formData.get("kind") as "transfer" | "sale";
  const file = requireFile(formData, "file");
  const rows = JSON.parse(formData.get("rows") as string) as ResolvedRow[];
  const guideNumber = formData.get("guideNumber") as string;

  if (kind === "transfer") {
    const destinationEstablishmentId = formData.get("destinationEstablishmentId") as string;
    await requireEstablishmentAccess(session.user.id, session.user.role, destinationEstablishmentId);
    const destinationPaddockId = (formData.get("destinationPaddockId") as string | null) || null;

    await confirmTransferBatch({
      userId: session.user.id,
      role: session.user.role,
      operatingEstablishmentId: destinationEstablishmentId,
      destinationEstablishmentId,
      destinationPaddockId,
      originEstablishmentId: formData.get("originEstablishmentId") as string,
      guideNumber,
      guideDocument: {
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        data: Buffer.from(await file.arrayBuffer()),
      },
      rows,
    });
    return;
  }

  const originEstablishmentId = formData.get("originEstablishmentId") as string;
  await requireEstablishmentAccess(session.user.id, session.user.role, originEstablishmentId);
  const forcedWithdrawalTags = JSON.parse(formData.get("forcedWithdrawalTags") as string) as string[];
  const buyer = (formData.get("buyer") as string | null) || null;
  const price = (formData.get("price") as string | null) || null;
  const weightKg = (formData.get("weightKg") as string | null) || null;
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

export async function listPaddocksAction(establishmentId: string): Promise<PaddockCatalogEntry[]> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  return listPaddocksByEstablishment(establishmentId);
}

export async function createPaddockAction(establishmentId: string, name: string): Promise<PaddockCatalogEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  return createPaddock(establishmentId, name);
}
