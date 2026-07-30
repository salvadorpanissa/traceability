import { describe, expect, it } from "vitest";
import { deduceAgeMonthsForCategory, type CategoryAgeBracket } from "@/lib/activities/category-birth-date";

// Mirrors the real category table's male age brackets plus the shared
// newborn stage, so tests exercise the same shape production data has.
const categories: CategoryAgeBracket[] = [
  { id: "ternero", minAgeMonths: 0 },
  { id: "ternera", minAgeMonths: 0 },
  { id: "novillo-1-2", minAgeMonths: 12 },
  { id: "novillo-2-3", minAgeMonths: 24 },
  { id: "novillo-3-plus", minAgeMonths: 36 },
  { id: "toro", minAgeMonths: null },
];

describe("deduceAgeMonthsForCategory", () => {
  it("returns the midpoint between a bracket and the next one", () => {
    expect(deduceAgeMonthsForCategory("novillo-2-3", categories)).toBe(30);
  });

  it("returns the midpoint for a lower bracket too", () => {
    expect(deduceAgeMonthsForCategory("novillo-1-2", categories)).toBe(18);
  });

  it("uses the next threshold across sexes for a birth-stage category with no same-sex bracket above it", () => {
    expect(deduceAgeMonthsForCategory("ternero", categories)).toBe(6);
    expect(deduceAgeMonthsForCategory("ternera", categories)).toBe(6);
  });

  it("extends an open-ended top bracket by the previous bracket's gap", () => {
    expect(deduceAgeMonthsForCategory("novillo-3-plus", categories)).toBe(42);
  });

  it("returns null for a category with no minAgeMonths at all", () => {
    expect(deduceAgeMonthsForCategory("toro", categories)).toBeNull();
  });

  it("returns null for an unknown category id", () => {
    expect(deduceAgeMonthsForCategory("missing", categories)).toBeNull();
  });

  it("returns the bare minimum when the only bracket has no next and no previous", () => {
    const onlyBracket: CategoryAgeBracket[] = [{ id: "only", minAgeMonths: 24 }];
    expect(deduceAgeMonthsForCategory("only", onlyBracket)).toBe(24);
  });
});
