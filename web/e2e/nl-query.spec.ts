import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("asks a natural-language question and sees a results table", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);

  await page.getByPlaceholder(/pregunt/i).fill("¿Cuántos animales hay por estado?");
  await page.getByRole("button", { name: /consultar/i }).click();

  await expect(page.getByRole("columnheader", { name: "status" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "total" })).toBeVisible();
});
