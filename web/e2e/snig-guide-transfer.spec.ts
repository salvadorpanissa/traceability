import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSnigGuideFixturePdf } from "../test/snig-guide-fixture";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("uploads a SNIG guide PDF and confirms a transfer between two DICOSE-registered farms", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Register origin (DICOSE C) and destination (DICOSE D) codes for the same
  // owner ("Pérez", seeded by e2e/global-setup.ts) and the only farm the
  // fresh test DB seeds ("Campo Norte", from db/seed.ts). Two distinct
  // dicose_registration rows against the same farm still exercise the full
  // DICOSE-to-farm resolution and confirm path end to end; the resulting
  // transfer just has originFarmId === destinationFarmId, which
  // requireTransferAuthorization allows for any role.
  await page.goto("/settings/dicose");
  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("DICOSE").fill("151400442");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("151400442")).toBeVisible();

  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("DICOSE").fill("151518192");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("151518192")).toBeVisible();

  const buffer = await buildSnigGuideFixturePdf({
    guideNumber: "E2E-GUIDE-1",
    eventDateDisplay: "11/07/2026",
    dicoseA: "151400442",
    dicoseB: "151400442",
    dicoseC: "151400442",
    dicoseD: "151518192",
    animals: [{ tag: "900000000001", sex: "H", ageMonths: 24 }],
  });
  const pdfPath = path.join(os.tmpdir(), "snig-guide-e2e.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(buffer));

  await page.goto("/activities/transfer");
  await page.getByRole("button", { name: "Guía SNIG (PDF)" }).click();
  await page.getByLabel("Archivo").setInputFiles(pdfPath);
  await page.getByRole("button", { name: "Subir" }).click();

  await expect(page.getByText("E2E-GUIDE-1")).toBeVisible();
  // Origin and destination are the same seeded farm here (see note above),
  // so "Campo Norte" renders twice in the preview's <dl> (origin + destino) —
  // use .first() to avoid a strict-mode violation.
  await expect(page.getByText("Campo Norte").first()).toBeVisible();
  await expect(page.getByText("900000000001")).toBeVisible();

  // The animal's tag was never loaded as an "own tag" for either DICOSE
  // registration (see e2e/dicose-foreign-tag.spec.ts for that flow), so
  // resolveBatchRows classifies it as "foreign" (status "Ajena") rather than
  // "new" — there's no own_tag row anywhere claiming this tag. Force it in,
  // same as the existing foreign-tag transfer spec does.
  await expect(page.getByText("Ajena")).toBeVisible();
  await page.getByLabel("Es mía de todos modos").check();

  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  fs.unlinkSync(pdfPath);
});
