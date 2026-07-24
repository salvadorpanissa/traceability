"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolveBatchRows, confirmTransferBatch, type ResolvedRow } from "@/lib/activities/transfer";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { listPaddocksByFarm, createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { parseSnigGuide } from "@/lib/activities/snig-guide-parsing";
import { findFarmByDicoseCode } from "@/lib/dal/dicose-registration";
import { estimateBirthDateFromAge } from "@/lib/activities/date-normalization";
import type { MappedRow } from "@/lib/activities/column-mapping";

export type PreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | { mappingNeeded: false; eventDateNeeded: true; headerSignature: string; mapping: ColumnMapping[] }
  | {
      mappingNeeded: false;
      eventDateNeeded: false;
      headerSignature: string;
      mapping: ColumnMapping[];
      rows: ResolvedRow[];
    };

function hasUnconfiguredColumn(mapping: ColumnMapping[]): boolean {
  return mapping.some((m) => m.meaning === "ignore");
}

export async function previewTransferBatch(formData: FormData): Promise<PreviewResult> {
  const session = await requireSession();
  const operatingFarmId = formData.get("farmId") as string;
  await requireFarmAccess(session.user.id, session.user.role, operatingFarmId);

  const file = formData.get("file") as File;
  const eventDateInput = formData.get("eventDate") as string | null;
  const eventDate = eventDateInput && eventDateInput.length > 0 ? eventDateInput : null;
  const mappingOverride = formData.get("mapping") as string | null;

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);
  const headerSignature = computeHeaderSignature(headers);

  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    const [existing] = await db.select().from(columnMapping).where(eq(columnMapping.headerSignature, headerSignature));
    if (!existing) {
      return { mappingNeeded: true, headers, initialMapping: null };
    }
    const existingMapping = existing.mapping as ColumnMapping[];
    if (hasUnconfiguredColumn(existingMapping)) {
      return { mappingNeeded: true, headers, initialMapping: existingMapping };
    }
    mapping = existingMapping;
  }

  const hasDateColumn = mapping.some((m) => m.meaning === "date");
  if (!hasDateColumn && !eventDate) {
    return { mappingNeeded: false, eventDateNeeded: true, headerSignature, mapping };
  }

  const mappedRows = applyColumnMapping(headers, rows, mapping);
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingFarmId);

  return { mappingNeeded: false, eventDateNeeded: false, headerSignature, mapping, rows: resolvedRows };
}

export async function confirmTransferBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  destinationFarmId: string;
  destinationPaddockId: string | null;
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, input.destinationFarmId);

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoUpdate({ target: columnMapping.headerSignature, set: { mapping: input.mapping } });

  // Rows for animals already tracked keep their real current location
  // (resolveBatchRows/confirmTransferBatch derive it from animal_current_state);
  // this only stands in as the batch's own farm and as the placement farm for
  // rows with no known location yet (new/foreign) — there's no separate
  // "origin" to ask for since the destination is already what's being marked.
  await confirmTransferBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId: input.destinationFarmId,
    destinationFarmId: input.destinationFarmId,
    destinationPaddockId: input.destinationPaddockId,
    rows: input.rows,
  });
}

export type PdfPreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      guideNumber: string;
      eventDate: string;
      originFarmId: string;
      originFarmName: string;
      destinationFarmId: string;
      destinationFarmName: string;
      rows: ResolvedRow[];
    };

export async function previewTransferBatchFromPdf(formData: FormData): Promise<PdfPreviewResult> {
  const session = await requireSession();
  const file = formData.get("file") as File;
  const buffer = await file.arrayBuffer();

  let guide;
  try {
    guide = await parseSnigGuide(buffer);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el PDF" };
  }

  const origin = await findFarmByDicoseCode(guide.originDicoseCode);
  if (!origin) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.originDicoseCode}` };
  }
  const destination = await findFarmByDicoseCode(guide.destinationDicoseCode);
  if (!destination) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.destinationDicoseCode}` };
  }

  await requireFarmAccess(session.user.id, session.user.role, destination.farmId);

  const mappedRows: MappedRow[] = guide.animals.map((a) => ({
    tag: a.tag,
    date: guide.eventDate,
    category: null,
    sex: a.sex,
    ownerName: null,
    notes: null,
    birthDate: a.ageMonths !== null ? estimateBirthDateFromAge(guide.eventDate, a.ageMonths) : null,
  }));

  const rows = await resolveBatchRows(mappedRows, guide.eventDate, destination.farmId);

  return {
    ok: true,
    guideNumber: guide.guideNumber,
    eventDate: guide.eventDate,
    originFarmId: origin.farmId,
    originFarmName: origin.farmName,
    destinationFarmId: destination.farmId,
    destinationFarmName: destination.farmName,
    rows,
  };
}

export async function confirmTransferBatchFromPdfAction(input: {
  originFarmId: string;
  destinationFarmId: string;
  destinationPaddockId: string | null;
  guideNumber: string;
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, input.destinationFarmId);

  await confirmTransferBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId: input.destinationFarmId,
    destinationFarmId: input.destinationFarmId,
    destinationPaddockId: input.destinationPaddockId,
    originFarmId: input.originFarmId,
    guideNumber: input.guideNumber,
    rows: input.rows,
  });
}

export async function createOwnerAction(name: string): Promise<OwnerCatalogEntry> {
  await requireSession();
  return createOwner(name);
}

export async function listPaddocksAction(farmId: string): Promise<PaddockCatalogEntry[]> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, farmId);
  return listPaddocksByFarm(farmId);
}

export async function createPaddockAction(farmId: string, name: string): Promise<PaddockCatalogEntry> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, farmId);
  return createPaddock(farmId, name);
}
