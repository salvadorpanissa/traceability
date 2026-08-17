"use server";

import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";
import { resolveImportRows, confirmImportChunk, type ResolvedImportRow } from "@/lib/activities/bulk-import";

export async function parseImportFileAction(formData: FormData): Promise<{ headers: string[]; rows: string[][] }> {
  await requireSession();
  const file = requireFile(formData, "file");
  const buffer = await file.arrayBuffer();
  return parseExcelFile(buffer);
}

export type ImportChunkActionResult = {
  createdCount: number;
  errors: { tag: string; reason: string }[];
};

// resolveImportRows scopes establishment-name matching to session.user's own
// campos (admin: all, manager: only theirs) — that's what keeps a manager
// from importing into another cliente's establecimiento, not a role check
// here.
export async function importChunkAction(rows: MappedImportRow[]): Promise<ImportChunkActionResult> {
  const session = await requireSession();
  const resolved = await resolveImportRows(rows, session.user.id, session.user.role);

  const validRows = resolved.filter(
    (r): r is Extract<ResolvedImportRow, { status: "valid" }> => r.status === "valid"
  );
  const errors = resolved
    .filter((r): r is Extract<ResolvedImportRow, { status: "error" }> => r.status === "error")
    .map((r) => ({ tag: r.tag, reason: r.reason }));

  const { createdCount } = await confirmImportChunk({ userId: session.user.id, rows: validRows });

  return { createdCount, errors };
}
