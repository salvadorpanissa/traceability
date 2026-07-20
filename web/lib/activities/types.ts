export type ParsedExcelRow = {
  tag: string
  category?: string
}

export type ExcelParseResult = { ok: true; rows: ParsedExcelRow[] } | { ok: false; error: string }
