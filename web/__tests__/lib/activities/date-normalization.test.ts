import { describe, expect, it } from "vitest";
import { normalizeDate } from "@/lib/activities/date-normalization";

describe("normalizeDate", () => {
  it("passes through an ISO date unchanged", () => {
    expect(normalizeDate("2026-07-08")).toBe("2026-07-08");
  });

  it("normalizes a day/month/year slash date", () => {
    expect(normalizeDate("8/7/2026")).toBe("2026-07-08");
  });

  it("normalizes a zero-padded day/month/year dash date", () => {
    expect(normalizeDate("08-07-2026")).toBe("2026-07-08");
  });

  it("normalizes a month/year-only date to the 1st of the month", () => {
    expect(normalizeDate("01/2021")).toBe("2021-01-01");
  });

  it("normalizes a single-digit month/year date", () => {
    expect(normalizeDate("7/2026")).toBe("2026-07-01");
  });

  it("rejects an out-of-range month in month/year form", () => {
    expect(normalizeDate("13/2026")).toBeNull();
  });

  it("rejects an out-of-range day or month in day/month/year form", () => {
    expect(normalizeDate("32/1/2026")).toBeNull();
    expect(normalizeDate("1/13/2026")).toBeNull();
  });

  it("rejects free text that isn't a date", () => {
    expect(normalizeDate("Adulto (sin fecha exacta)")).toBeNull();
    expect(normalizeDate("Castrada")).toBeNull();
    expect(normalizeDate("not a date")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeDate("  8/7/2026  ")).toBe("2026-07-08");
  });
});
