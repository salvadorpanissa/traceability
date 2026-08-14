"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import {
  resolveRecategorizeBatchRows,
  type RecategorizeResolvedRow,
  type UnresolvableDecision,
} from "@/lib/activities/recategorize-resolution";
import { confirmRecategorizeBatch } from "@/lib/activities/recategorize";
import { listCategoriesByFarm, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";

export type PreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | { mappingNeeded: false; eventDateNeeded: true; headerSignature: string; mapping: ColumnMapping[] }
  | {
      mappingNeeded: false;
      eventDateNeeded: false;
      headerSignature: string;
      mapping: ColumnMapping[];
      rows: RecategorizeResolvedRow[];
    };

function hasUnconfiguredColumn(mapping: ColumnMapping[]): boolean {
  return mapping.some((m) => m.meaning === "ignore");
}

export async function previewRecategorizeBatch(formData: FormData): Promise<PreviewResult> {
  const session = await requireSession();
  const operatingFarmId = formData.get("farmId") as string;
  await requireFarmAccess(session.user.id, session.user.role, operatingFarmId);

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
  const rows_ = await resolveRecategorizeBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingFarmId);

  return { mappingNeeded: false, eventDateNeeded: false, headerSignature, mapping, rows: rows_ };
}

export async function confirmRecategorizeBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  farmId: string;
  targetCategoryId: string;
  rows: RecategorizeResolvedRow[];
  unresolvableDecisions: Record<string, UnresolvableDecision>;
  sexMismatchDecisions: Record<string, UnresolvableDecision>;
}): Promise<void> {
  const session = await requireSession();

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoUpdate({ target: columnMapping.headerSignature, set: { mapping: input.mapping } });

  await confirmRecategorizeBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId: input.farmId,
    targetCategoryId: input.targetCategoryId,
    rows: input.rows,
    unresolvableDecisions: input.unresolvableDecisions,
    sexMismatchDecisions: input.sexMismatchDecisions,
  });
}

export async function listCategoriesAction(farmId: string): Promise<CategoryCatalogEntry[]> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, farmId);
  return listCategoriesByFarm(farmId);
}
