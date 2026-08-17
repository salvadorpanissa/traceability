import type { ResolvedRow } from "@/lib/activities/batch-resolution";

export type PaddockMismatch = { tag: string; currentPaddockId: string };

// Only same-establishment mismatches are eligible: an "existing" row can
// resolve to an animal that currently lives at a *different* establecimiento,
// and relocating it from here would bypass the cross-establecimiento
// authorization the real traslado flow enforces (see
// requireTransferAuthorization in lib/activities/transfer.ts).
export function isSameEstablishmentMismatch(
  row: ResolvedRow,
  paddockId: string,
  operatingEstablishmentId: string
): row is Extract<ResolvedRow, { status: "existing" }> & { currentPaddockId: string } {
  return (
    row.status === "existing" &&
    row.currentEstablishmentId === operatingEstablishmentId &&
    !!row.currentPaddockId &&
    row.currentPaddockId !== paddockId
  );
}

export function findPaddockMismatches(
  rows: ResolvedRow[],
  paddockId: string | null,
  operatingEstablishmentId: string
): PaddockMismatch[] {
  if (!paddockId) return [];
  const mismatches: PaddockMismatch[] = [];
  for (const row of rows) {
    if (!isSameEstablishmentMismatch(row, paddockId, operatingEstablishmentId)) continue;
    mismatches.push({ tag: row.tag, currentPaddockId: row.currentPaddockId });
  }
  return mismatches;
}

// Tags officially living in the chosen potrero that never show up in the
// uploaded batch — a sign the sanidad forgot one.
export function findMissingFromPaddock(rows: ResolvedRow[], paddockTags: string[]): string[] {
  const rowTags = new Set(rows.map((row) => row.tag));
  return paddockTags.filter((tag) => !rowTags.has(tag));
}
