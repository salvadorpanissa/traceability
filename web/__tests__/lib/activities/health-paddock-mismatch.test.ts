import { describe, expect, it } from "vitest";
import { findPaddockMismatches } from "@/lib/activities/health";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

function existingRow(tag: string, currentPaddockId: string | null): ResolvedRow {
  return {
    tag,
    eventDate: "2026-02-01",
    notes: null,
    status: "existing",
    animalId: "animal-1",
    currentFarmId: "farm-1",
    currentPaddockId,
  };
}

function newRow(tag: string): ResolvedRow {
  return {
    tag,
    eventDate: "2026-02-01",
    notes: null,
    status: "new",
    categoryId: null,
    sex: null,
    birthDate: null,
    ownerId: null,
    pendingOwnerName: null,
  };
}

describe("findPaddockMismatches", () => {
  it("returns nothing when no potrero was chosen for the sanidad", () => {
    expect(findPaddockMismatches([existingRow("AR1", "potrero-b")], null)).toEqual([]);
  });

  it("returns nothing when every existing row already matches the chosen potrero", () => {
    expect(findPaddockMismatches([existingRow("AR1", "potrero-a")], "potrero-a")).toEqual([]);
  });

  it("flags an existing row whose current potrero differs from the chosen one", () => {
    expect(findPaddockMismatches([existingRow("AR1", "potrero-b")], "potrero-a")).toEqual([
      { tag: "AR1", currentPaddockId: "potrero-b" },
    ]);
  });

  it("ignores a row with no current potrero assigned", () => {
    expect(findPaddockMismatches([existingRow("AR1", null)], "potrero-a")).toEqual([]);
  });

  it("ignores rows that aren't status 'existing'", () => {
    expect(findPaddockMismatches([newRow("AR2")], "potrero-a")).toEqual([]);
  });
});
