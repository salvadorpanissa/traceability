import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("login, farm selection (auto-skip for single farm), and logout", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("Dashboard")).toBeVisible();
  await expect(page.getByText("Campo Norte")).toBeVisible();

  await page.getByRole("button", { name: /cerrar sesión/i }).click();
  await page.waitForURL(/\/login/);
});

test("rejects invalid credentials with a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: /ingresar/i }).click();

  await expect(page.getByText("Email o contraseña incorrectos")).toBeVisible();
});
