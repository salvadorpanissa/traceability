"use server";

import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { rememberedInitialMapping } from "@/lib/dal/column-header-meaning";
import type { ColumnMapping } from "@/lib/activities/column-mapping";

// Shared by every batch-import wizard (Sanidad, Recategorización, Traslado):
// parsing the file and pre-filling the mapping needs no establishment/farm
// context at all, unlike everything downstream of it (value legends, row
// resolution, catalogs) — splitting it out is what lets each wizard ask for
// the file before asking which campo it belongs to.
export async function parseActivityFileAction(
  formData: FormData
): Promise<{ headers: string[]; rows: string[][]; initialMapping: ColumnMapping[] | null }> {
  await requireSession();
  const file = requireFile(formData, "file");
  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);
  return { headers, rows, initialMapping: await rememberedInitialMapping(headers) };
}
