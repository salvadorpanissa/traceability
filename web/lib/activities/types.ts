export type ParsedExcelRow = {
  tag: string
  category?: string
}

export type ExcelParseResult = { ok: true; rows: ParsedExcelRow[] } | { ok: false; error: string }

export type PreviewRow =
  | { tag: string; kind: 'existing'; animalId: string }
  | { tag: string; kind: 'new'; categoryId: string | null }
  | { tag: string; kind: 'error'; reason: string }
