"use server";

import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";
import { resolveImportRows, confirmImportChunk, confirmImportUpdates, type ResolvedImportRow } from "@/lib/activities/bulk-import";

export async function parseImportFileAction(formData: FormData): Promise<{ headers: string[]; rows: string[][] }> {
  await requireSession();
  const file = requireFile(formData, "file");
  const buffer = await file.arrayBuffer();
  return parseExcelFile(buffer);
}

export type ImportChunkActionResult = {
  createdCount: number;
  updatedCount: number;
  errors: { tag: string; reason: string }[];
};

export type ImportPreviewRow =
  | { tag: string; action: "crear" }
  | { tag: string; action: "editar"; fields: string[] }
  | { tag: string; action: "error"; reason: string };

const UPDATE_FIELD_LABELS: Record<string, string> = {
  ownerName: "propietario",
  breed: "raza",
  sex: "sexo",
  birthDate: "fecha nacimiento",
  secondaryTag: "chip secundario",
};

// Read-only: reuses resolveImportRows' lookups but never calls
// confirmImportChunk/confirmImportUpdates, so nothing is written yet.
export async function previewImportAction(rows: MappedImportRow[]): Promise<ImportPreviewRow[]> {
  const session = await requireSession();
  const resolved = await resolveImportRows(rows, session.user.id, session.user.role);

  return resolved.map((r) => {
    if (r.status === "valid") return { tag: r.tag, action: "crear" };
    if (r.status === "update") {
      const fields = (Object.keys(UPDATE_FIELD_LABELS) as (keyof typeof UPDATE_FIELD_LABELS)[])
        .filter((key) => r[key as "ownerName" | "breed" | "sex" | "birthDate" | "secondaryTag"])
        .map((key) => UPDATE_FIELD_LABELS[key]);
      return { tag: r.tag, action: "editar", fields };
    }
    return { tag: r.tag, action: "error", reason: r.reason };
  });
}

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
  const updateRows = resolved.filter(
    (r): r is Extract<ResolvedImportRow, { status: "update" }> => r.status === "update"
  );
  const errors = resolved
    .filter((r): r is Extract<ResolvedImportRow, { status: "error" }> => r.status === "error")
    .map((r) => ({ tag: r.tag, reason: r.reason }));

  const { createdCount } = await confirmImportChunk({ userId: session.user.id, rows: validRows });
  const { updatedCount } = await confirmImportUpdates({ rows: updateRows });

  return { createdCount, updatedCount, errors };
}
