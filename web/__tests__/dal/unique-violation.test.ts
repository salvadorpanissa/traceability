import { describe, expect, it } from "vitest";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

describe("isUniqueViolationError", () => {
  it("is true for a Postgres unique_violation error (code 23505)", () => {
    expect(isUniqueViolationError({ code: "23505" })).toBe(true);
  });

  it("is false for other error shapes", () => {
    expect(isUniqueViolationError({ code: "23503" })).toBe(false);
    expect(isUniqueViolationError(new Error("boom"))).toBe(false);
    expect(isUniqueViolationError(null)).toBe(false);
    expect(isUniqueViolationError(undefined)).toBe(false);
    expect(isUniqueViolationError("boom")).toBe(false);
  });
});
