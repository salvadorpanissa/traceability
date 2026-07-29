"use server";

import { requireSession } from "@/lib/dal/session";
import { isAdmin } from "@/lib/dal/farm-access";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";
import { resolveImportRows, confirmImportChunk, type ResolvedImportRow } from "@/lib/activities/bulk-import";

// Every action below is reachable directly (bypassing the Task 8 page's own
// admin check), so each one must re-verify admin status independently — a
// manager (or any other authenticated user) must never be able to invoke
// these by calling the server action itself.
async function requireAdminSession() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) {
    throw new Error("No tenés acceso a esta herramienta");
  }
  return session;
}

export async function parseImportFileAction(formData: FormData): Promise<{ headers: string[]; rows: string[][] }> {
  await requireAdminSession();
  const file = requireFile(formData, "file");
  const buffer = await file.arrayBuffer();
  return parseExcelFile(buffer);
}

export type ImportChunkActionResult = {
  createdCount: number;
  errors: { tag: string; reason: string }[];
};

export async function importChunkAction(rows: MappedImportRow[]): Promise<ImportChunkActionResult> {
  const session = await requireAdminSession();
  const resolved = await resolveImportRows(rows);

  const validRows = resolved.filter(
    (r): r is Extract<ResolvedImportRow, { status: "valid" }> => r.status === "valid"
  );
  const errors = resolved
    .filter((r): r is Extract<ResolvedImportRow, { status: "error" }> => r.status === "error")
    .map((r) => ({ tag: r.tag, reason: r.reason }));

  const { createdCount } = await confirmImportChunk({ userId: session.user.id, rows: validRows });

  return { createdCount, errors };
}
