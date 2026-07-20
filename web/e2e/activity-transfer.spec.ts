import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'

async function buildExcelFile(rows: { tag: string; category?: string }[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Caravanas')
  sheet.addRow(['caravana', 'categoria'])
  for (const row of rows) sheet.addRow([row.tag, row.category ?? ''])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function selectDestinationFarm(page: import('@playwright/test').Page, farmName: string) {
  // shadcn/Radix Select — not a native <select>, so option picking needs a
  // click-to-open, click-the-option sequence rather than selectOption().
  await page.getByLabel('Campo destino').click()
  await page.getByRole('option', { name: farmName }).click()
}

test('uploading an Excel with a new tag shows it as "nueva" in the preview, and confirming creates it', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await page.goto('/actividades/nueva')

  const excel = await buildExcelFile([{ tag: 'e2e-transfer-001', category: '' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await selectDestinationFarm(page, 'Campo Test Uno')
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page.getByText('e2e-transfer-001')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})

test('a duplicate tag in the Excel is shown as an error and blocks confirmation', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await page.goto('/actividades/nueva')

  const excel = await buildExcelFile([{ tag: 'e2e-transfer-dup' }, { tag: 'e2e-transfer-dup' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await selectDestinationFarm(page, 'Campo Test Uno')
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page.getByText(/duplicada/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
})
