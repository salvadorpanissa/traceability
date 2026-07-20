import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

test('a manager with one farm skips the picker', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await expect(page).toHaveURL(/\/dashboard/)
})

test('an admin with multiple farms sees the picker and can choose one', async ({ page }) => {
  await login(page, 'e2e.admin@test.local')
  await expect(page).toHaveURL(/\/select-farm/)
  await expect(page.getByText('Elegí un campo')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Campo Test Uno' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Campo Test Dos' })).toBeVisible()

  await page.getByRole('button', { name: 'Campo Test Uno' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
})

test('a manager with no farms sees an explicit message instead of a dashboard', async ({ page }) => {
  await login(page, 'e2e.manager.no.farm@test.local')
  await expect(page).toHaveURL(/\/select-farm/)
  await expect(page.getByText('No tenés campos asignados. Contactá al administrador.')).toBeVisible()
})
