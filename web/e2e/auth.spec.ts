import { test, expect } from '@playwright/test'

test('unauthenticated visit to a protected route redirects to /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('invalid credentials show an inline error and stay on /login', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e.manager.one.farm@test.local')
  await page.getByLabel('Contraseña').fill('wrong-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('valid credentials for a one-farm manager land on the dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e.manager.one.farm@test.local')
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
