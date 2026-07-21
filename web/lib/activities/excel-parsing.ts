import ExcelJS from "exceljs";

export type ParsedExcel = {
  headers: string[];
  rows: string[][];
};

export async function parseExcelFile(buffer: ArrayBuffer): Promise<ParsedExcel> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [] };
  }

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(cell.text.trim());
  });

  const rows: string[][] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    const values: string[] = [];
    for (let col = 1; col <= headers.length; col++) {
      values.push(row.getCell(col).text.trim());
    }
    rows.push(values);
  }

  return { headers, rows };
}
