import { describe, test, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseTagExcel } from '@/lib/activities/parse-tag-excel'

async function buildExcelBuffer(headers: string[], rows: (string | undefined)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Caravanas')
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

describe('parseTagExcel', () => {
  test('parses tag-only rows', async () => {
    const buffer = await buildExcelBuffer(['caravana'], [['123'], ['456']])
    const result = await parseTagExcel(buffer)
    expect(result).toEqual({
      ok: true,
      rows: [
        { tag: '123', category: undefined },
        { tag: '456', category: undefined },
      ],
    })
  })

  test('parses tag + categoria columns', async () => {
    const buffer = await buildExcelBuffer(['caravana', 'categoria'], [['123', 'Ternero'], ['456', undefined]])
    const result = await parseTagExcel(buffer)
    expect(result).toEqual({
      ok: true,
      rows: [
        { tag: '123', category: 'Ternero' },
        { tag: '456', category: undefined },
      ],
    })
  })

  test('skips empty rows', async () => {
    const buffer = await buildExcelBuffer(['caravana'], [['123'], [undefined], ['456']])
    const result = await parseTagExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toHaveLength(2)
  })

  test('returns an error when the caravana column is missing', async () => {
    const buffer = await buildExcelBuffer(['otra_columna'], [['123']])
    const result = await parseTagExcel(buffer)
    expect(result).toEqual({ ok: false, error: 'El Excel no tiene una columna "caravana".' })
  })

  test('column matching is case-insensitive', async () => {
    const buffer = await buildExcelBuffer(['CARAVANA'], [['123']])
    const result = await parseTagExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toEqual([{ tag: '123', category: undefined }])
  })
})
