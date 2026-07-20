import ExcelJS from 'exceljs'
import type { RawExcelResult } from './types'

export async function parseRawExcel(buffer: ArrayBuffer): Promise<RawExcelResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    return { ok: false, error: 'El archivo no tiene ninguna hoja.' }
  }

  const columnCount = worksheet.columnCount
  const headerRow = worksheet.getRow(1)
  const headers: string[] = []
  for (let col = 1; col <= columnCount; col++) {
    headers.push(String(headerRow.getCell(col).value ?? '').trim())
  }
  if (headers.every((h) => h === '')) {
    return { ok: false, error: 'El Excel no tiene encabezados.' }
  }

  const rows: string[][] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values: string[] = []
    for (let col = 1; col <= columnCount; col++) {
      values.push(String(row.getCell(col).value ?? '').trim())
    }
    if (values.every((v) => v === '')) return
    rows.push(values)
  })

  return { ok: true, headers, rows }
}
