"use server";

import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import {
  computeHeaderSignature,
  applyOwnTagColumnMapping,
  ownTagMappingHasPaddock,
  type ColumnMapping,
  type MappedOwnTagRow,
} from "@/lib/activities/column-mapping";
import {
  importOwnTags,
  countOwnTagsByRegistration,
  findMissingPaddockNames,
  findMissingCategoryNames,
  type OwnTagImportResult,
} from "@/lib/dal/own-tag";
import { listDicoseRegistrations, type DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";
import { createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { createCategory, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";

export type OwnTagPreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | {
      mappingNeeded: false;
      headerSignature: string;
      mapping: ColumnMapping[];
      rows: MappedOwnTagRow[];
      pendingPaddockNames: string[];
      pendingCategoryNames: string[];
    };

// Namespaced so an own-tags file never collides with a transfer/health cached
// mapping that happens to share the same header row.
function ownTagHeaderSignature(headers: string[]): string {
  return computeHeaderSignature(["__own_tag__", ...headers]);
}

export async function previewOwnTagUpload(dicoseRegistrationId: string, formData: FormData): Promise<OwnTagPreviewResult> {
  await requireSession();

  const file = formData.get("file") as File;
  const mappingOverride = formData.get("mapping") as string | null;

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);
  const headerSignature = ownTagHeaderSignature(headers);

  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    const [existing] = await db.select().from(columnMapping).where(eq(columnMapping.headerSignature, headerSignature));
    const existingMapping = existing?.mapping as ColumnMapping[] | undefined;
    if (!existingMapping || !existingMapping.some((m) => m.meaning === "tag")) {
      return { mappingNeeded: true, headers, initialMapping: existingMapping ?? null };
    }
    mapping = existingMapping;
  }

  const mappedRows = applyOwnTagColumnMapping(headers, rows, mapping);

  let pendingPaddockNames: string[] = [];
  if (ownTagMappingHasPaddock(mapping)) {
    const paddockNames = mappedRows.map((r) => r.paddock).filter((n): n is string => !!n);
    pendingPaddockNames = await findMissingPaddockNames(dicoseRegistrationId, paddockNames);
  }

  let pendingCategoryNames: string[] = [];
  if (mapping.some((m) => m.meaning === "category")) {
    const categoryNames = mappedRows.map((r) => r.category).filter((n): n is string => !!n);
    pendingCategoryNames = await findMissingCategoryNames(categoryNames);
  }

  return { mappingNeeded: false, headerSignature, mapping, rows: mappedRows, pendingPaddockNames, pendingCategoryNames };
}

export async function createOwnTagPaddockAction(farmId: string, name: string): Promise<PaddockCatalogEntry> {
  await requireSession();
  return createPaddock(farmId, name);
}

export async function createOwnTagCategoryAction(name: string): Promise<CategoryCatalogEntry> {
  await requireSession();
  return createCategory(name);
}

export async function confirmOwnTagUpload(
  dicoseRegistrationId: string,
  headerSignature: string,
  mapping: ColumnMapping[],
  rows: MappedOwnTagRow[]
): Promise<OwnTagImportResult> {
  const session = await requireSession();

  await db
    .insert(columnMapping)
    .values({ headerSignature, mapping })
    .onConflictDoUpdate({ target: columnMapping.headerSignature, set: { mapping } });

  return importOwnTags(dicoseRegistrationId, session.user.id, rows);
}

export async function listOwnTagCounts(): Promise<
  { registration: DicoseRegistrationEntry; count: number; lastUploadedAt: string | null }[]
> {
  const session = await requireSession();
  const [registrations, counts] = await Promise.all([
    listDicoseRegistrations(session.user.id, session.user.role),
    countOwnTagsByRegistration(),
  ]);
  const countByRegistrationId = new Map(counts.map((c) => [c.dicoseRegistrationId, c]));
  return registrations.map((registration) => {
    const match = countByRegistrationId.get(registration.id);
    return {
      registration,
      count: match?.count ?? 0,
      lastUploadedAt: match?.lastUploadedAt ? match.lastUploadedAt.toISOString() : null,
    };
  });
}
