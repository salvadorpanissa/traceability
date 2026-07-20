import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

test('dashboard shows the active farm name and the user role', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('Campo Test Uno')).toBeVisible()
  await expect(page.getByText('manager', { exact: false })).toBeVisible()
})

test('the farm switcher is hidden for a user with only one farm', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('button', { name: 'Cambiar de campo' })).toHaveCount(0)
})

test('the farm switcher is visible for a user with multiple farms and returns to the picker', async ({ page }) => {
  await login(page, 'e2e.admin@test.local')
  await page.getByRole('button', { name: 'Campo Test Uno' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.getByRole('button', { name: 'Cambiar de campo' }).click()
  await expect(page).toHaveURL(/\/select-farm/)
})

test('logout clears the session and redirects to /login', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await expect(page).toHaveURL(/\/dashboard/)

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})
