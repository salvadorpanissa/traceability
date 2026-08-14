"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolveBatchRows, confirmTransferBatch, type ResolvedRow } from "@/lib/activities/transfer";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { listPaddocksByEstablishment, createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { requireEstablishmentAccess } from "@/lib/dal/farm-access";
import { parseSnigGuide } from "@/lib/activities/snig-guide-parsing";
import { findEstablishmentByDicoseCode } from "@/lib/dal/dicose";
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
  const operatingEstablishmentId = formData.get("establishmentId") as string;
  await requireEstablishmentAccess(session.user.id, session.user.role, operatingEstablishmentId);

  const file = requireFile(formData, "file");
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
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingEstablishmentId, {
    autoForceForeignWithoutOwner: true,
  });

  return { mappingNeeded: false, eventDateNeeded: false, headerSignature, mapping, rows: resolvedRows };
}

export async function confirmTransferBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  destinationEstablishmentId: string;
  destinationPaddockId: string | null;
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.destinationEstablishmentId);

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoUpdate({ target: columnMapping.headerSignature, set: { mapping: input.mapping } });

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

export type PdfPreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      guideNumber: string;
      eventDate: string;
      originEstablishmentId: string;
      originEstablishmentName: string;
      destinationEstablishmentId: string;
      destinationEstablishmentName: string;
      rows: ResolvedRow[];
    };

export async function previewTransferBatchFromPdf(formData: FormData): Promise<PdfPreviewResult> {
  const session = await requireSession();
  const file = requireFile(formData, "file");
  const buffer = await file.arrayBuffer();

  let guide;
  try {
    guide = await parseSnigGuide(buffer);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el PDF" };
  }

  const origin = await findEstablishmentByDicoseCode(guide.originDicoseCode);
  if (!origin) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.originDicoseCode}` };
  }
  const destination = await findEstablishmentByDicoseCode(guide.destinationDicoseCode);
  if (!destination) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.destinationDicoseCode}` };
  }

  await requireEstablishmentAccess(session.user.id, session.user.role, destination.establishmentId);

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

  const rows = await resolveBatchRows(mappedRows, guide.eventDate, destination.establishmentId, {
    autoForceForeignWithoutOwner: true,
  });

  return {
    ok: true,
    guideNumber: guide.guideNumber,
    eventDate: guide.eventDate,
    originEstablishmentId: origin.establishmentId,
    originEstablishmentName: origin.establishmentName,
    destinationEstablishmentId: destination.establishmentId,
    destinationEstablishmentName: destination.establishmentName,
    rows,
  };
}

// Takes FormData (not a plain object) so the original uploaded PDF — kept in
// the form's state since the upload step — can travel alongside the other
// fields the same way previewTransferBatchFromPdf already does; the file is
// persisted on the batch as the guide's source document.
export async function confirmTransferBatchFromPdfAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const destinationEstablishmentId = formData.get("destinationEstablishmentId") as string;
  await requireEstablishmentAccess(session.user.id, session.user.role, destinationEstablishmentId);

  const file = requireFile(formData, "file");
  const destinationPaddockId = (formData.get("destinationPaddockId") as string | null) || null;
  const rows = JSON.parse(formData.get("rows") as string) as ResolvedRow[];

  await confirmTransferBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingEstablishmentId: destinationEstablishmentId,
    destinationEstablishmentId,
    destinationPaddockId,
    originEstablishmentId: formData.get("originEstablishmentId") as string,
    guideNumber: formData.get("guideNumber") as string,
    guideDocument: {
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      data: Buffer.from(await file.arrayBuffer()),
    },
    rows,
  });
}

export async function createOwnerAction(name: string): Promise<OwnerCatalogEntry> {
  await requireSession();
  return createOwner(name);
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
