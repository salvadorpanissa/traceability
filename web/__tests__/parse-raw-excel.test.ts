import { describe, test, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseRawExcel } from '@/lib/activities/parse-raw-excel'

async function buildExcelBuffer(headers: string[], rows: (string | undefined)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Datos')
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

describe('parseRawExcel', () => {
  test('extracts headers and raw string rows with no column-name detection', async () => {
    const buffer = await buildExcelBuffer(['IDE', 'SEXO'], [['123', 'H'], ['456', 'M']])
    const result = await parseRawExcel(buffer)
    expect(result).toEqual({
      ok: true,
      headers: ['IDE', 'SEXO'],
      rows: [
        ['123', 'H'],
        ['456', 'M'],
      ],
    })
  })

  test('skips fully empty rows', async () => {
    const buffer = await buildExcelBuffer(['IDE'], [['123'], [undefined], ['456']])
    const result = await parseRawExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toEqual([['123'], ['456']])
  })

  test('pads missing trailing cells in a row to empty strings', async () => {
    const buffer = await buildExcelBuffer(['IDE', 'SEXO'], [['123', undefined]])
    const result = await parseRawExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toEqual([['123', '']])
  })

  test('returns an error when the workbook has no worksheet', async () => {
    const workbook = new ExcelJS.Workbook()
    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
    const result = await parseRawExcel(buffer)
    expect(result).toEqual({ ok: false, error: 'El archivo no tiene ninguna hoja.' })
  })

  test('returns an error when the header row is entirely blank', async () => {
    const buffer = await buildExcelBuffer(['', ''], [['123', 'H']])
    const result = await parseRawExcel(buffer)
    expect(result).toEqual({ ok: false, error: 'El Excel no tiene encabezados.' })
  })
})
