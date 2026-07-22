import { describe, expect, it } from "vitest";
import {
  computeHeaderSignature,
  applyColumnMapping,
  extractProductColumnValues,
  type ColumnMapping,
} from "@/lib/activities/column-mapping";

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
      { tag: "123456789012345", date: "2026-01-15", category: null, sex: null, ownerName: null, notes: null },
      { tag: "223456789012345", date: "", category: null, sex: null, ownerName: null, notes: null },
    ]);
  });

  it("leaves tag empty when no column is mapped to it", () => {
    const mapping: ColumnMapping[] = [{ header: "IDE", meaning: "ignore" }];
    const result = applyColumnMapping(headers, rows, mapping);
    expect(result[0].tag).toBe("");
  });
});

describe("applyColumnMapping with sex and owner columns", () => {
  it("maps sex and owner columns, leaving them null when unmapped", () => {
    const headers = ["IDE", "SEXO", "PROPIETARIO"];
    const rows = [["123456789012345", "M", "Pérez"]];
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "SEXO", meaning: "sex" },
      { header: "PROPIETARIO", meaning: "owner" },
    ];

    const result = applyColumnMapping(headers, rows, mapping);

    expect(result).toEqual([
      { tag: "123456789012345", date: null, category: null, sex: "M", ownerName: "Pérez", notes: null },
    ]);
  });

  it("leaves sex and owner null when their columns aren't mapped", () => {
    const headers = ["IDE"];
    const rows = [["123456789012345"]];
    const mapping: ColumnMapping[] = [{ header: "IDE", meaning: "tag" }];

    const result = applyColumnMapping(headers, rows, mapping);

    expect(result).toEqual([
      { tag: "123456789012345", date: null, category: null, sex: null, ownerName: null, notes: null },
    ]);
  });
});

describe("applyColumnMapping with a notes column", () => {
  it("maps the notes column", () => {
    const headers = ["IDE", "OBSERVACIONES"];
    const rows = [["123456789012345", "Cojera leve"]];
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "OBSERVACIONES", meaning: "notes" },
    ];

    const result = applyColumnMapping(headers, rows, mapping);

    expect(result).toEqual([
      { tag: "123456789012345", date: null, category: null, sex: null, ownerName: null, notes: "Cojera leve" },
    ]);
  });

  it("leaves notes null when no column is mapped as notes", () => {
    const headers = ["IDE"];
    const rows = [["123456789012345"]];
    const mapping: ColumnMapping[] = [{ header: "IDE", meaning: "tag" }];

    const result = applyColumnMapping(headers, rows, mapping);

    expect(result[0].notes).toBeNull();
  });
});

describe("ColumnMeaning", () => {
  it("includes product as a valid meaning", () => {
    const mapping: ColumnMapping = { header: "SANIDAD", meaning: "product" };
    expect(mapping.meaning).toBe("product");
  });
});

describe("extractProductColumnValues", () => {
  const headers = ["IDE", "SANIDAD", "SANIDAD 2"];
  const rows = [
    ["123456789012345", "ASPERSIN", "AFTOSA"],
    ["223456789012345", "ASPERSIN", "AFTOSA"],
  ];

  it("returns the first non-empty value for every column mapped as product, in mapping order", () => {
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "SANIDAD", meaning: "product" },
      { header: "SANIDAD 2", meaning: "product" },
    ];

    expect(extractProductColumnValues(headers, rows, mapping)).toEqual(["ASPERSIN", "AFTOSA"]);
  });

  it("skips a product column whose value is empty in every row", () => {
    const sparseRows = [
      ["123456789012345", "", "AFTOSA"],
      ["223456789012345", "", "AFTOSA"],
    ];
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "SANIDAD", meaning: "product" },
      { header: "SANIDAD 2", meaning: "product" },
    ];

    expect(extractProductColumnValues(headers, sparseRows, mapping)).toEqual(["AFTOSA"]);
  });

  it("returns an empty array when no column is mapped as product", () => {
    const mapping: ColumnMapping[] = [{ header: "IDE", meaning: "tag" }];
    expect(extractProductColumnValues(headers, rows, mapping)).toEqual([]);
  });
});
