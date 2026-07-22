import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("maps a Propietario column, gets a matched and an unmatched owner, and creates the missing owner inline", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/health");

  await page.getByLabel(/archivo/i).setInputFiles(path.join(__dirname, "fixtures", "health-owner-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("CARAVANA").selectOption("tag");
  await page.getByLabel("PROPIETARIO").selectOption("owner");
  await page.getByRole("button", { name: /continuar/i }).click();

  // health-owner-lote.xlsx has no date column, so the app asks for a single
  // date for the whole batch before showing the preview.
  await page.getByLabel("Fecha del lote").fill("2026-02-01");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000399")).toBeVisible();
  await expect(page.getByText("AR000000000400")).toBeVisible();
  await expect(page.getByText("Propietario pendiente: Propietario Nuevo")).toBeVisible();

  // Confirmar is disabled while the owner is pending, and the product step
  // still needs a valid product row filled in — Ivermectina 1% is seeded
  // for E2E in global-setup.ts, same as the other health specs.
  await expect(page.getByRole("button", { name: /confirmar/i })).toBeDisabled();

  await expect(page.getByText("Propietario Nuevo", { exact: true })).toBeVisible();
  await page.getByLabel("Nombre del propietario").fill("Propietario Nuevo");
  await page.getByRole("button", { name: /^crear$/i }).click();
  await expect(page.getByText("Propietario pendiente: Propietario Nuevo")).not.toBeVisible();

  await page.getByLabel("Producto").selectOption({ label: "Ivermectina 1%" });
  await page.getByLabel("Dosis", { exact: true }).fill("10");
  await page.getByLabel("Vía").fill("subcutánea");

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});
