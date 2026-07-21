import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("maps two product columns, gets a matched and an unmatched suggestion, and creates the missing product inline", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/health");

  await page
    .getByLabel(/archivo/i)
    .setInputFiles(path.join(__dirname, "fixtures", "health-two-products-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  // First time this header signature is seen: map CARAVANA to tag, both
  // product columns to Producto.
  await page.getByLabel("CARAVANA").selectOption("tag");
  await page.getByLabel("PRODUCTO1").selectOption("product");
  await page.getByLabel("PRODUCTO2").selectOption("product");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000299")).toBeVisible();

  // Row 1: matched "Ivermectina 1%" from the catalog already.
  const productSelects = page.getByLabel("Producto");
  await expect(productSelects.nth(0)).toHaveValue(/.+/);

  // Row 2: unmatched "Antiparasitario Nuevo" — its select starts empty;
  // choosing "+ Crear producto nuevo" reveals the name input, pre-filled
  // with the raw Excel value that didn't match anything in the catalog.
  await productSelects.nth(1).selectOption("__create_new__");
  await expect(page.getByLabel("Nombre del producto nuevo")).toHaveValue("Antiparasitario Nuevo");
  await page.getByRole("button", { name: /^crear$/i }).click();
  await expect(page.getByLabel("Nombre del producto nuevo")).not.toBeVisible();

  await page.getByLabel("Dosis", { exact: true }).first().fill("10");
  await page.getByLabel("Vía").first().fill("subcutánea");
  // Row 2's product was created with no default dose unit (createProductAction
  // only sets the name), so unlike row 1 it needs Unidad filled by hand too.
  await page.getByLabel("Dosis", { exact: true }).nth(1).fill("5");
  await page.getByLabel("Unidad").nth(1).fill("ml");
  await page.getByLabel("Vía").nth(1).fill("oral");

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});
