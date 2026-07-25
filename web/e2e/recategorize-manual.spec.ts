import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

// Matches e2e/dicose-foreign-tag.spec.ts's writeSingleColumnExcel, generalized
// to multiple columns — the app only accepts real .xlsx uploads (see
// lib/activities/excel-parsing.ts, which loads the buffer through ExcelJS'
// workbook.xlsx.load and would reject a plain CSV), so fixtures have to be
// real workbooks, not text files.
async function writeExcel(filePath: string, headers: string[], rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  await workbook.xlsx.writeFile(filePath);
}

test("uploads a file of tags and confirms a manual recategorization", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  // waitForURL can resolve mid-redirect-chain (login -> /dashboard ->
  // /select-farm's single-farm auto-select -> /dashboard again), before the
  // active_farm_id cookie is actually set. Waiting for real dashboard content
  // (matching e2e/transfer-activity.spec.ts's pattern) ensures the
  // auto-select transition has actually finished before navigating away.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Create two categories to recategorize between. Categories are global
  // (components/settings/category-catalog-form.tsx has no farm selector),
  // and the "Nombre" input/"Agregar" button are confirmed real from that
  // component's markup.
  await page.goto("/settings/categories");
  await page.getByLabel("Nombre").fill("Novillo E2E");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Novillo E2E", { exact: true })).toBeVisible();
  await page.getByLabel("Nombre").fill("Novillo E2E +3");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Novillo E2E +3")).toBeVisible();

  // Create an animal with an initial category via the Transfer activity's
  // Excel path, so this spec has a real animal at a known farm/category to
  // act on. "AR000000000099" is one of the own_tag rows global-setup.ts
  // registers under a DICOSE registration on "Campo Norte" (the only farm
  // db/seed.ts creates), so it resolves to a creatable "new" row rather than
  // "foreign" — see lib/activities/batch-resolution.ts. The "Categoria"
  // column lets createNewAnimal (lib/activities/animal-creation.ts) assign
  // an initial category via a self-recategorize event.
  const transferPath = path.join(os.tmpdir(), "recategorize-e2e-transfer.xlsx");
  await writeExcel(
    transferPath,
    ["Caravana", "Fecha", "Categoria"],
    [["AR000000000099", "2026-01-01", "Novillo E2E"]]
  );

  await page.goto("/activities/transfer");
  // transfer-form.tsx disables the "Subir" button until a destination farm
  // is chosen, so "Campo destino" must be selected before the upload.
  await page.getByLabel("Campo destino", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel(/archivo/i).setInputFiles(transferPath);
  await page.getByRole("button", { name: /^subir$/i }).click();

  // First time this header signature is seen: map each column. ColumnMapper
  // (components/activities/column-mapper.tsx) labels each select with the
  // literal header text and expects the ColumnMeaning key as the option value.
  await page.getByLabel("Caravana", { exact: true }).selectOption("tag");
  await page.getByLabel("Fecha", { exact: true }).selectOption("date");
  await page.getByLabel("Categoria", { exact: true }).selectOption("category");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000099")).toBeVisible();
  // exact:true — a plain substring match for "Nuevo" also hits the hidden
  // "+ Crear potrero nuevo" <option> (Playwright's string getByText is
  // case-insensitive substring matching by default), which resolves first
  // and is not visible.
  await expect(page.getByText("Nuevo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  // Now recategorize it manually via the Recategorización activity.
  const recatPath = path.join(os.tmpdir(), "recategorize-e2e-recat.xlsx");
  await writeExcel(recatPath, ["Caravana", "Fecha"], [["AR000000000099", "2026-06-01"]]);

  await page.goto("/activities/recategorize");
  await page.getByLabel("Campo").selectOption({ label: "Campo Norte" });
  await page.getByLabel("Categoría destino").selectOption({ label: "Novillo E2E +3" });
  await page.getByLabel(/archivo/i).setInputFiles(recatPath);
  await page.getByRole("button", { name: /^subir$/i }).click();

  // First time this (smaller) header signature is seen: only tag/date/notes
  // are offered here (components/activities/recategorize-form.tsx passes a
  // narrower availableMeanings than Transfer's — no "category" column, since
  // the destination category comes from the "Categoría destino" select).
  await page.getByLabel("Caravana", { exact: true }).selectOption("tag");
  await page.getByLabel("Fecha", { exact: true }).selectOption("date");
  await page.getByRole("button", { name: /continuar/i }).click();

  // getByText("Novillo E2E") also matches the "Categoría destino" <option>
  // still in the DOM, so scope these to the preview table's cells.
  await expect(page.getByText("AR000000000099")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Novillo E2E", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Novillo E2E +3" })).toBeVisible();

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  fs.unlinkSync(transferPath);
  fs.unlinkSync(recatPath);
});
