import ExcelJS from 'exceljs'
import type { ExcelParseResult, ParsedExcelRow } from './types'

export async function parseTagExcel(buffer: ArrayBuffer): Promise<ExcelParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    return { ok: false, error: 'El archivo no tiene ninguna hoja.' }
  }

  const headerRow = worksheet.getRow(1)
  let tagColumn = -1
  let categoryColumn = -1
  headerRow.eachCell((cell, colNumber) => {
    const value = String(cell.value ?? '').trim().toLowerCase()
    if (value === 'caravana') tagColumn = colNumber
    if (value === 'categoria' || value === 'categoría') categoryColumn = colNumber
  })

  if (tagColumn === -1) {
    return { ok: false, error: 'El Excel no tiene una columna "caravana".' }
  }

  const rows: ParsedExcelRow[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const tag = String(row.getCell(tagColumn).value ?? '').trim()
    if (!tag) return
    const category =
      categoryColumn !== -1 ? String(row.getCell(categoryColumn).value ?? '').trim() || undefined : undefined
    rows.push({ tag, category })
  })

  return { ok: true, rows }
}
