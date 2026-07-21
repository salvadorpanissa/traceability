import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("picks a destination farm and an existing paddock, then creates a new paddock inline", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/transfer");

  await page.getByLabel(/archivo/i).setInputFiles(path.join(__dirname, "fixtures", "transfer-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("IDE").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000099")).toBeVisible();

  await page.getByLabel("Campo destino").selectOption({ label: "Campo Norte" });
  await page.getByLabel("Potrero destino").selectOption({ label: "Potrero 1" });

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});

test("creates a new destination paddock inline before confirming", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/transfer");

  // Uses a fixture with a header not used by any other fixture ("CARAVANA_TRASLADO")
  // so this test gets its own never-before-seen header signature and always sees
  // the column-mapping step — column_mapping is keyed only by header signature,
  // shared across activities, so reusing a plain "CARAVANA" header here would
  // silently reuse the mapping saved by health-activity.spec.ts's "CARAVANA" fixture.
  await page.getByLabel(/archivo/i).setInputFiles(path.join(__dirname, "fixtures", "transfer-lote-paddock.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("CARAVANA_TRASLADO").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000199")).toBeVisible();

  await page.getByLabel("Campo destino").selectOption({ label: "Campo Norte" });
  await page.getByLabel("Potrero destino").selectOption("__create_new__");
  await page.getByLabel(/nombre del potrero nuevo/i).fill("Potrero Nuevo");
  await page.getByRole("button", { name: /^crear$/i }).click();
  await expect(page.getByLabel("Potrero destino")).toHaveValue(/.+/);

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});
