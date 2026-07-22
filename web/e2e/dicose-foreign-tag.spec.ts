import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

async function writeSingleColumnExcel(filePath: string, header: string, values: string[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow([header]);
  for (const value of values) sheet.addRow([value]);
  await workbook.xlsx.writeFile(filePath);
}

test("registers a DICOSE, loads its own tags, then flags a foreign tag during a transfer batch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/settings/dicose");
  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("Código DICOSE").fill("151999888");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("151999888")).toBeVisible();

  await page.goto("/settings/own-tags");
  const ownTagsPath = path.join(os.tmpdir(), "own-tags-e2e.xlsx");
  await writeSingleColumnExcel(ownTagsPath, "Caravana", ["500000000500"]);
  await page.getByLabel("Registro DICOSE").selectOption({ label: "Pérez — Campo Norte (151999888)" });
  await page.getByLabel("Archivo").setInputFiles(ownTagsPath);
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(page.getByText(/1 caravanas nuevas cargadas/)).toBeVisible();

  await page.goto("/activities/transfer");
  const transferPath = path.join(os.tmpdir(), "transfer-foreign-e2e.xlsx");
  await writeSingleColumnExcel(transferPath, "CARAVANA_E2E", ["500000000500", "500000000501"]);
  await page.getByLabel(/archivo/i).setInputFiles(transferPath);
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("CARAVANA_E2E").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.getByLabel("Fecha del lote").fill("2026-02-01");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("Nuevo")).toBeVisible();
  await expect(page.getByText("Ajena")).toBeVisible();

  await page.getByLabel("Es mía de todos modos").check();
  await page.getByLabel("Campo destino").selectOption({ label: "Campo Norte" });

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  fs.unlinkSync(ownTagsPath);
  fs.unlinkSync(transferPath);
});
