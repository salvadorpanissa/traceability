import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { cellText, parseExcelFile } from "@/lib/activities/excel-parsing";

async function buildWorkbookBuffer(headers: string[], rows: (string | number)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("parseExcelFile", () => {
  it("reads the first row as headers and the rest as string rows", async () => {
    const buffer = await buildWorkbookBuffer(
      ["IDE", "Fecha", "SANIDAD"],
      [
        ["123456789012345", "2026-01-15", "ASPERSIN"],
        ["223456789012345", "2026-01-15", "AFTOSA"],
      ]
    );

    const { headers, rows } = await parseExcelFile(buffer);

    expect(headers).toEqual(["IDE", "Fecha", "SANIDAD"]);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe("123456789012345");
    expect(rows[1][2]).toBe("AFTOSA");
  });

  it("returns an empty rows array for a header-only file", async () => {
    const buffer = await buildWorkbookBuffer(["IDE"], []);
    const { headers, rows } = await parseExcelFile(buffer);
    expect(headers).toEqual(["IDE"]);
    expect(rows).toEqual([]);
  });

  it("skips trailing blank rows below the real data", async () => {
    // A row with every cell cleared to "" still has cellCount > 0 in ExcelJS,
    // which is exactly what real spreadsheets leave behind past the last row
    // of actual data (formatting/used-range extends further than the data).
    const buffer = await buildWorkbookBuffer(
      ["IDE", "Fecha"],
      [
        ["123456789012345", "2026-01-15"],
        ["", ""],
        ["", ""],
      ]
    );

    const { rows } = await parseExcelFile(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("123456789012345");
  });

  it("formats a real Excel date cell as an ISO date instead of a locale-formatted string", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["IDE", "Fecha alta"]);
    sheet.addRow(["123456789012345", new Date("2026-06-11T00:00:00.000Z")]);
    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;

    const { rows } = await parseExcelFile(buffer);

    expect(rows[0][1]).toBe("2026-06-11");
  });
});

describe("cellText", () => {
  it("converts a numeric cell with a date-like numFmt to an ISO date", () => {
    // Reproduces the case where a workbook's styles reference a numFmt
    // ExcelJS itself failed to resolve on load, so the cell stayed a plain
    // Excel serial number instead of being converted to a Date upstream —
    // same date column, some rows converted fine, this one didn't.
    const cell = { value: 46211, numFmt: "dd/mm/yyyy", text: "46211" } as ExcelJS.Cell;
    expect(cellText(cell)).toBe("2026-07-08");
  });

  it("leaves a plain number without a date numFmt as its literal text", () => {
    const cell = { value: 42, numFmt: "0", text: "42" } as ExcelJS.Cell;
    expect(cellText(cell)).toBe("42");
  });
});
