"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import {
  resolveRecategorizeBatchRows,
  type RecategorizeResolvedRow,
  type UnresolvableDecision,
} from "@/lib/activities/recategorize-resolution";
import { confirmRecategorizeBatch } from "@/lib/activities/recategorize";
import { listCategories, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";

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

// The form no longer asks which campo the lote belongs to, so there's no
// single farm to check access against up front — instead every resolved row
// is scoped after the fact against the campos the user is actually assigned
// to. Without this, uploading a list of caravanas would read back any
// animal's campo/categoría/estado in the whole system.
function maskRowsOutsideFarmAccess(
  rows: RecategorizeResolvedRow[],
  accessibleFarmIds: string[]
): RecategorizeResolvedRow[] {
  const allowed = new Set(accessibleFarmIds);
  return rows.map((row) =>
    row.status === "error" || allowed.has(row.currentFarmId)
      ? row
      : {
          tag: row.tag,
          eventDate: row.eventDate,
          notes: row.notes,
          status: "error" as const,
          reason: "No tenés acceso a este campo",
        }
  );
}

export async function previewRecategorizeBatch(formData: FormData): Promise<PreviewResult> {
  const session = await requireSession();

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
  const resolvedRows = await resolveRecategorizeBatchRows(mappedRows, hasDateColumn ? null : eventDate);
  const scopedRows = isAdmin(session.user.role)
    ? resolvedRows
    : maskRowsOutsideFarmAccess(resolvedRows, await userFarmIds(session.user.id));

  return { mappingNeeded: false, eventDateNeeded: false, headerSignature, mapping, rows: scopedRows };
}

export async function confirmRecategorizeBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
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
    targetCategoryId: input.targetCategoryId,
    rows: input.rows,
    unresolvableDecisions: input.unresolvableDecisions,
    sexMismatchDecisions: input.sexMismatchDecisions,
  });
}

export async function listCategoriesAction(): Promise<CategoryCatalogEntry[]> {
  await requireSession();
  return listCategories();
}
