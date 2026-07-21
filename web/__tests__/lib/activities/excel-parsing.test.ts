import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseExcelFile } from "@/lib/activities/excel-parsing";

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
});
