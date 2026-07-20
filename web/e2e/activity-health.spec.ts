import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'

async function buildExcelFile(rows: { tag: string; category?: string }[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Caravanas')
  sheet.addRow(['caravana', 'categoria'])
  for (const row of rows) sheet.addRow([row.tag, row.category ?? ''])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test('sanidad on a new tag creates the animal, places it, and prefills the product withdrawal period', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e.manager.one.farm@test.local')
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/actividades/nueva')
  await page.getByLabel('Tipo de actividad').selectOption('Sanidad')

  await page.getByLabel('Producto').selectOption({ label: 'Ivermectina 1%' })
  await expect(page.getByLabel('Días de carencia')).toHaveValue('21')

  const excel = await buildExcelFile([{ tag: 'e2e-health-001' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  // getByLabel does case-insensitive substring matching by default, and
  // "Dosis" is a literal substring of "Unidad de dosis" — without `exact`
  // this locator resolves to both fields (strict-mode violation). Same
  // class of issue as Task 3's getByText heading collision.
  await page.getByLabel('Dosis', { exact: true }).fill('10')
  await page.getByLabel('Unidad de dosis').fill('ml')
  await page.getByLabel('Vía de administración').fill('subcutánea')

  await page.getByRole('button', { name: 'Validar' }).click()
  await expect(page.getByText('e2e-health-001')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})
