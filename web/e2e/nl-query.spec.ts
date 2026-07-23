import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("asks a natural-language question and sees a results table", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // The NL query below reads from animal_current_state (via my_animal_state),
  // which starts empty in the shared E2E test DB (see global-setup.ts). Seed
  // an animal ourselves — following the same self-contained convention as
  // health-activity.spec.ts and transfer-activity.spec.ts — instead of
  // relying on another spec file having already run and left data behind.
  //
  // Uses its own fixture with a header not used by any other spec
  // ("CARAVANA_NL") so this test always gets a never-before-seen header
  // signature and sees the column-mapping step — column_mapping is keyed
  // only by header signature, shared across activities, so reusing
  // health-activity.spec.ts's plain "CARAVANA" header would silently skip
  // the mapping step when this spec runs after it in the full suite (see
  // the equivalent comment in transfer-destination-paddock.spec.ts).
  await page.goto("/activities/health");

  await page
    .getByLabel(/archivo/i)
    .setInputFiles(path.join(__dirname, "fixtures", "nl-query-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("CARAVANA_NL").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();

  // nl-query-lote.xlsx has no date column, so the app asks for a single date
  // for the whole batch before showing the preview.
  await page.getByLabel("Fecha del lote").fill("2026-02-01");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000299")).toBeVisible();

  await page.getByLabel("Producto").selectOption({ label: "Ivermectina 1%" });
  await page.getByLabel("Dosis", { exact: true }).fill("10");
  await page.getByLabel("Vía").fill("subcutánea");

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  await page.goto("/dashboard");

  await page.getByPlaceholder(/pregunt/i).fill("¿Cuántos animales hay por estado?");
  await page.getByRole("button", { name: /consultar/i }).click();

  await expect(page.getByRole("columnheader", { name: "status" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "total" })).toBeVisible();
});
