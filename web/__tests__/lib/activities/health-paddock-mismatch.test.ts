import { describe, expect, it } from "vitest";
import { findPaddockMismatches } from "@/lib/activities/health-paddock-mismatch";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

const OPERATING_FARM_ID = "farm-1";

function existingRow(tag: string, currentPaddockId: string | null, currentFarmId = OPERATING_FARM_ID): ResolvedRow {
  return {
    tag,
    eventDate: "2026-02-01",
    notes: null,
    status: "existing",
    animalId: "animal-1",
    currentFarmId,
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
    expect(findPaddockMismatches([existingRow("AR1", "potrero-b")], null, OPERATING_FARM_ID)).toEqual([]);
  });

  it("returns nothing when every existing row already matches the chosen potrero", () => {
    expect(findPaddockMismatches([existingRow("AR1", "potrero-a", OPERATING_FARM_ID)], "potrero-a", OPERATING_FARM_ID)).toEqual([]);
  });

  it("flags an existing row whose current potrero differs from the chosen one", () => {
    expect(findPaddockMismatches([existingRow("AR1", "potrero-b")], "potrero-a", OPERATING_FARM_ID)).toEqual([
      { tag: "AR1", currentPaddockId: "potrero-b" },
    ]);
  });

  it("ignores a row with no current potrero assigned", () => {
    expect(findPaddockMismatches([existingRow("AR1", null)], "potrero-a", OPERATING_FARM_ID)).toEqual([]);
  });

  it("does not flag an existing row whose animal is currently at a different farm", () => {
    expect(
      findPaddockMismatches([existingRow("AR1", "potrero-b", "farm-2")], "potrero-a", OPERATING_FARM_ID)
    ).toEqual([]);
  });

  it("ignores rows that aren't status 'existing'", () => {
    expect(findPaddockMismatches([newRow("AR2")], "potrero-a", OPERATING_FARM_ID)).toEqual([]);
  });
});
