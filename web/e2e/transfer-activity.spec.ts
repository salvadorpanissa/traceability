import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("uploads a transfer Excel, maps columns, and confirms the batch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  // waitForURL can resolve mid-redirect-chain (login -> /dashboard ->
  // /select-farm's single-farm auto-select -> /dashboard again), before the
  // active_farm_id cookie is actually set. Waiting for real dashboard content
  // (matching e2e/auth-flow.spec.ts's pattern) ensures the auto-select
  // transition has actually finished before navigating away.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/transfer");

  await page
    .getByLabel(/archivo/i)
    .setInputFiles(path.join(__dirname, "fixtures", "transfer-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  // First time this header signature is seen: map "IDE" to "Caravana".
  await page.getByLabel("IDE").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000099")).toBeVisible();
  await expect(page.getByText(/nuevo/i)).toBeVisible();
});
