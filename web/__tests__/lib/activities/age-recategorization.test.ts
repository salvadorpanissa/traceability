import { describe, expect, it } from "vitest";
import { computeAgeMonths, resolveCategoryForAge, type AgeCategoryRule } from "@/lib/activities/age-recategorization";

describe("computeAgeMonths", () => {
  it("computes whole elapsed months", () => {
    expect(computeAgeMonths("2023-01-01", "2026-07-24")).toBe(42);
  });

  it("does not count the current month if the day-of-month hasn't been reached yet", () => {
    expect(computeAgeMonths("2023-01-15", "2026-07-01")).toBe(41);
  });

  it("counts the current month once the day-of-month has been reached", () => {
    expect(computeAgeMonths("2023-01-15", "2026-07-15")).toBe(42);
  });

  it("returns 0 for a birth date in the future", () => {
    expect(computeAgeMonths("2027-01-01", "2026-07-24")).toBe(0);
  });

  it("returns 0 for a birth date equal to asOfDate", () => {
    expect(computeAgeMonths("2026-07-24", "2026-07-24")).toBe(0);
  });
});

describe("resolveCategoryForAge", () => {
  const rules: AgeCategoryRule[] = [
    { id: "calf", sex: null, minAgeMonths: 0 },
    { id: "male-1-2", sex: "male", minAgeMonths: 12 },
    { id: "male-2-3", sex: "male", minAgeMonths: 24 },
    { id: "male-3-plus", sex: "male", minAgeMonths: 36 },
    { id: "female-1-2", sex: "female", minAgeMonths: 12 },
    { id: "female-2-3", sex: "female", minAgeMonths: 24 },
    { id: "manual-only", sex: null, minAgeMonths: null },
  ];

  it("picks the highest bracket at or below the animal's age, for its sex", () => {
    expect(resolveCategoryForAge(rules, "male", 30)).toBe("male-2-3");
    expect(resolveCategoryForAge(rules, "female", 30)).toBe("female-2-3");
  });

  it("picks the open-ended top bracket once past its threshold", () => {
    expect(resolveCategoryForAge(rules, "male", 50)).toBe("male-3-plus");
  });

  it("falls back to a sex-unscoped bracket when no sex-specific one applies yet", () => {
    expect(resolveCategoryForAge(rules, "male", 3)).toBe("calf");
  });

  it("never crosses into the other sex's track", () => {
    expect(resolveCategoryForAge(rules, "female", 50)).toBe("female-2-3");
  });

  it("ignores categories with no minAgeMonths configured", () => {
    // manual-only has minAgeMonths: null and must never be selected, regardless of age.
    expect(resolveCategoryForAge(rules, "male", 100)).not.toBe("manual-only");
  });

  it("returns null when the animal is younger than every configured bracket", () => {
    const onlyOlderBrackets: AgeCategoryRule[] = [{ id: "male-3-plus", sex: "male", minAgeMonths: 36 }];
    expect(resolveCategoryForAge(onlyOlderBrackets, "male", 10)).toBeNull();
  });
});
