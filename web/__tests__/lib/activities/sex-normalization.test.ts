import { describe, expect, it } from "vitest";
import { normalizeSex } from "@/lib/activities/sex-normalization";

describe("normalizeSex", () => {
  it.each([
    ["M", "male"],
    ["m", "male"],
    ["MACHO", "male"],
    ["macho", "male"],
    ["  Macho  ", "male"],
    ["H", "female"],
    ["h", "female"],
    ["HEMBRA", "female"],
    ["hembra", "female"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizeSex(raw)).toBe(expected);
  });

  it.each([[null], [""], ["  "], ["X"], ["desconocido"]])("returns null for %s", (raw) => {
    expect(normalizeSex(raw)).toBeNull();
  });
});
