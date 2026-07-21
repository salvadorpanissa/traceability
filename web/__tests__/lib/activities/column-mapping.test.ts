import { describe, expect, it } from "vitest";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";

describe("computeHeaderSignature", () => {
  it("is stable for the same headers in the same order", () => {
    expect(computeHeaderSignature(["IDE", "Fecha"])).toBe(computeHeaderSignature(["IDE", "Fecha"]));
  });

  it("differs when header order differs", () => {
    expect(computeHeaderSignature(["IDE", "Fecha"])).not.toBe(computeHeaderSignature(["Fecha", "IDE"]));
  });
});

describe("applyColumnMapping", () => {
  const headers = ["IDE", "Fecha", "SEXO"];
  const rows = [
    ["123456789012345", "2026-01-15", "M"],
    ["223456789012345", "", "H"],
  ];

  it("maps tag and date columns, leaving unmapped columns out", () => {
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "Fecha", meaning: "date" },
      { header: "SEXO", meaning: "ignore" },
    ];

    const result = applyColumnMapping(headers, rows, mapping);

    expect(result).toEqual([
      { tag: "123456789012345", date: "2026-01-15", category: null },
      { tag: "223456789012345", date: "", category: null },
    ]);
  });

  it("leaves tag empty when no column is mapped to it", () => {
    const mapping: ColumnMapping[] = [{ header: "IDE", meaning: "ignore" }];
    const result = applyColumnMapping(headers, rows, mapping);
    expect(result[0].tag).toBe("");
  });
});

describe("ColumnMeaning", () => {
  it("includes product as a valid meaning", () => {
    const mapping: ColumnMapping = { header: "SANIDAD", meaning: "product" };
    expect(mapping.meaning).toBe("product");
  });
});
