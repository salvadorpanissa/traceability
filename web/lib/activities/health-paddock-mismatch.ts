import type { ResolvedRow } from "@/lib/activities/batch-resolution";

export type PaddockMismatch = { tag: string; currentPaddockId: string };

// Only same-farm mismatches are eligible: an "existing" row can resolve to an
// animal that currently lives at a *different* farm, and relocating it from
// here would bypass the cross-farm authorization the real traslado flow
// enforces (see requireTransferAuthorization in lib/activities/transfer.ts).
export function isSameFarmMismatch(
  row: ResolvedRow,
  paddockId: string,
  operatingFarmId: string
): row is Extract<ResolvedRow, { status: "existing" }> & { currentPaddockId: string } {
  return (
    row.status === "existing" &&
    row.currentFarmId === operatingFarmId &&
    !!row.currentPaddockId &&
    row.currentPaddockId !== paddockId
  );
}

export function findPaddockMismatches(
  rows: ResolvedRow[],
  paddockId: string | null,
  operatingFarmId: string
): PaddockMismatch[] {
  if (!paddockId) return [];
  const mismatches: PaddockMismatch[] = [];
  for (const row of rows) {
    if (!isSameFarmMismatch(row, paddockId, operatingFarmId)) continue;
    mismatches.push({ tag: row.tag, currentPaddockId: row.currentPaddockId });
  }
  return mismatches;
}
