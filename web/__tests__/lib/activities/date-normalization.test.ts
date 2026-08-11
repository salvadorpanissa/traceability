import { describe, expect, it } from "vitest";
import { estimateBirthDateFromAge, normalizeDate } from "@/lib/activities/date-normalization";

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

  it("normalizes a dot-separated date", () => {
    expect(normalizeDate("08.07.2026")).toBe("2026-07-08");
  });

  it("normalizes a slash date with a 2-digit year", () => {
    expect(normalizeDate("8/7/26")).toBe("2026-07-08");
  });

  it("strips a trailing time-of-day from an ISO date", () => {
    expect(normalizeDate("2026-07-08 00:00:00")).toBe("2026-07-08");
    expect(normalizeDate("2026-07-08T00:00:00.000Z")).toBe("2026-07-08");
  });

  it("strips a trailing time-of-day from a slash date", () => {
    expect(normalizeDate("8/7/2026 0:00")).toBe("2026-07-08");
  });
});

describe("estimateBirthDateFromAge", () => {
  it("subtracts whole months and approximates to the 1st of the resulting month", () => {
    expect(estimateBirthDateFromAge("2026-07-11", 90)).toBe("2019-01-01");
  });

  it("handles an age of 0 months as born the same month", () => {
    expect(estimateBirthDateFromAge("2026-07-11", 0)).toBe("2026-07-01");
  });

  it("crosses a year boundary correctly", () => {
    expect(estimateBirthDateFromAge("2026-01-11", 2)).toBe("2025-11-01");
  });
});
