import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("opens Configuración del campo from the header and manages a product end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("link", { name: "Configuración del campo" }).click();
  await page.waitForURL(/\/settings\/dicose/);

  await page.getByRole("link", { name: "Productos" }).click();
  await page.waitForURL(/\/settings\/products/);

  await page.getByLabel("Nombre").fill("Ivermectina E2E");
  await page.getByLabel("Unidad de dosis").fill("ml");
  await page.getByLabel("Días de retiro").fill("21");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Ivermectina E2E")).toBeVisible();

  await page.getByRole("button", { name: "Editar" }).first().click();
  await page.getByLabel("Editar unidad de dosis").fill("cc");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("cc")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Ivermectina E2E")).toBeVisible();
  await expect(page.getByText("cc")).toBeVisible();
});
