"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolveBatchRows, confirmTransferBatch, type ResolvedRow } from "@/lib/activities/transfer";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { listPaddocksByFarm, createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { requireFarmAccess } from "@/lib/dal/farm-access";

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

async function requireOperatingFarmId(): Promise<string> {
  const cookieStore = await cookies();
  const activeFarmId = cookieStore.get("active_farm_id")?.value;
  if (!activeFarmId) {
    throw new Error("No hay un campo activo seleccionado");
  }
  return activeFarmId;
}

export async function previewTransferBatch(formData: FormData): Promise<PreviewResult> {
  await requireSession();

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
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate);

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
  const operatingFarmId = await requireOperatingFarmId();

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoNothing({ target: columnMapping.headerSignature });

  await confirmTransferBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId,
    destinationFarmId: input.destinationFarmId,
    destinationPaddockId: input.destinationPaddockId,
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
