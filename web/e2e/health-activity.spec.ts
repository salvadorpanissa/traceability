import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("uploads a health Excel, maps columns, adds a product, and confirms the batch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/health");

  await page
    .getByLabel(/archivo/i)
    .setInputFiles(path.join(__dirname, "fixtures", "health-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("CARAVANA").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000199")).toBeVisible();

  await page.getByLabel("Producto").selectOption({ label: "Ivermectina 1%" });
  await page.getByLabel("Dosis", { exact: true }).fill("10");
  await page.getByLabel("Vía").fill("subcutánea");

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});
