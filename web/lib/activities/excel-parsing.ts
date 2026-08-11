import ExcelJS from "exceljs";

export type ParsedExcel = {
  headers: string[];
  rows: string[][];
};

// Same date-format heuristic ExcelJS itself uses to decide whether a numeric
// cell represents a date (see its `isDateFmt`): strip quoted literals and
// bracketed locale/color tags, then look for date/time format characters.
const DATE_NUM_FMT = /[ymdhMsb]+/;
function isDateFormat(fmt: string | undefined): boolean {
  if (!fmt) return false;
  return DATE_NUM_FMT.test(fmt.replace(/\[[^\]]*]/g, "").replace(/"[^"]*"/g, ""));
}

// Excel/ExcelJS store date-only values as a UTC-midnight Date instance —
// `cell.text` instead formats that Date using the *host machine's* local
// timezone, which silently shifts the calendar day (and produces a string
// no date parser in this codebase recognizes). Reading `cell.value`
// directly and taking its UTC calendar date sidesteps both problems.
export function cellText(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) {
    return cell.value.toISOString().slice(0, 10);
  }
  // Some workbooks (typically produced by third-party export tools) reference
  // a numFmt ExcelJS doesn't resolve on read, so a cell Excel displays as a
  // date stays a plain serial number here instead of becoming a Date above —
  // same date column, some rows converted, some not. Convert it ourselves:
  // Excel's day-zero is 1899-12-30 (serial 25569 = 1970-01-01, the Unix epoch).
  if (typeof cell.value === "number" && isDateFormat(cell.numFmt)) {
    return new Date((cell.value - 25569) * 86400000).toISOString().slice(0, 10);
  }
  return cell.text.trim();
}

export async function parseExcelFile(buffer: ArrayBuffer): Promise<ParsedExcel> {
  const workbook = new ExcelJS.Workbook();
  // exceljs bundles its own (older) @types/node transitively via @fast-csv/*,
  // whose Buffer type is structurally incompatible with our project's
  // (newer, generic) Buffer type — `as Buffer` doesn't resolve this since
  // bare `Buffer` still means our own generic type. `any` bypasses the
  // mismatch; the runtime value is a real, correctly-constructed Buffer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(buffer) as any);

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
      values.push(cellText(row.getCell(col)));
    }
    // Excel keeps a row's cells "present" (non-zero cellCount) even once every
    // value has been cleared out — trailing rows below the real data commonly
    // end up like this — so cellCount alone doesn't detect a blank row.
    if (values.every((value) => value === "")) continue;
    rows.push(values);
  }

  return { headers, rows };
}
