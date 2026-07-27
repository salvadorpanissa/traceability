import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

// Spec-local tag, registered fresh below through the same DICOSE + own-tags
// UI flow e2e/dicose-foreign-tag.spec.ts uses — deliberately NOT one of
// global-setup.ts's shared AR0000000000XX pool, which e2e/transfer-activity.spec.ts
// and e2e/transfer-destination-paddock.spec.ts also assert against for a
// fresh "new"/"Nuevo" animal-creation flow. Reusing a shared tag here would
// make this spec's assertions about that tag's status depend on execution
// order relative to those two specs. See review finding on Task 6.
// Must be digits-only: lib/dal/own-tag.ts's importOwnTags rejects any tag
// that doesn't match CARAVAN_PATTERN (/^\d+$/) as an "invalid row" when
// registering through this UI upload path (global-setup.ts's AR-prefixed
// tags bypass this by inserting directly via SQL, not through this form).
const OWN_TAG = "700000000700";

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

  // Register a fresh own_tag through the same UI flow
  // e2e/dicose-foreign-tag.spec.ts uses (settings/dicose -> settings/own-tags),
  // instead of reusing one of global-setup.ts's shared AR0000000000XX tags —
  // see OWN_TAG's comment above. "Pérez" is the owner global-setup.ts already
  // seeds; the DICOSE code just needs to be distinct from other specs' rows,
  // which it is.
  await page.goto("/settings/dicose");
  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("Código DICOSE").fill("160099911");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("160099911")).toBeVisible();

  await page.goto("/settings/own-tags");
  const ownTagsPath = path.join(os.tmpdir(), "recategorize-e2e-own-tags.xlsx");
  await writeExcel(ownTagsPath, ["Caravana"], [[OWN_TAG]]);
  await page.getByLabel("Registro DICOSE").selectOption({ label: "Pérez — Campo Norte (160099911)" });
  await page.getByLabel("Archivo").setInputFiles(ownTagsPath);
  await page.getByRole("button", { name: "Subir" }).click();

  // This own-tags header signature ("Caravana", single column) may or may
  // not already be mapped, depending on whether another spec uploaded a file
  // with this exact header before this one ran — handle both so this spec
  // doesn't depend on that ordering either. Wait for whichever element the
  // (async) preview settles on, rather than checking isVisible() right away
  // (which would race the server action and always read as "not yet there").
  const tagMappingSelect = page.getByLabel("Caravana", { exact: true });
  const confirmButton = page.getByRole("button", { name: "Confirmar carga" });
  await Promise.race([tagMappingSelect.waitFor({ state: "visible" }), confirmButton.waitFor({ state: "visible" })]);
  if (await tagMappingSelect.isVisible()) {
    await tagMappingSelect.selectOption("tag");
    await page.getByRole("button", { name: /continuar/i }).click();
    await confirmButton.waitFor({ state: "visible" });
  }
  await confirmButton.click();
  await expect(page.getByText(/1 caravanas registradas/)).toBeVisible();

  // Create an animal with an initial category via the Transfer activity's
  // Excel path, so this spec has a real animal at a known farm/category to
  // act on. OWN_TAG is registered above under a DICOSE registration on
  // "Campo Norte" (the only farm db/seed.ts creates), so it resolves to a
  // creatable "new" row rather than "foreign" — see
  // lib/activities/batch-resolution.ts. The "Categoria" column lets
  // createNewAnimal (lib/activities/animal-creation.ts) assign an initial
  // category via a self-recategorize event.
  const transferPath = path.join(os.tmpdir(), "recategorize-e2e-transfer.xlsx");
  await writeExcel(transferPath, ["Caravana", "Fecha", "Categoria"], [[OWN_TAG, "2026-01-01", "Novillo E2E"]]);

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

  await expect(page.getByText(OWN_TAG)).toBeVisible();
  // exact:true — a plain substring match for "Nuevo" also hits the hidden
  // "+ Crear potrero nuevo" <option> (Playwright's string getByText is
  // case-insensitive substring matching by default), which resolves first
  // and is not visible.
  await expect(page.getByText("Nuevo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  // Now recategorize it manually via the Recategorización activity.
  const recatPath = path.join(os.tmpdir(), "recategorize-e2e-recat.xlsx");
  await writeExcel(recatPath, ["Caravana", "Fecha"], [[OWN_TAG, "2026-06-01"]]);

  await page.goto("/activities/recategorize");
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
  await expect(page.getByText(OWN_TAG)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Novillo E2E", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Novillo E2E +3" })).toBeVisible();

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  fs.unlinkSync(ownTagsPath);
  fs.unlinkSync(transferPath);
  fs.unlinkSync(recatPath);
});

test("recategorizes an animal with no category using its age, with no farm selection needed", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // An age-managed, sex-unscoped calf category with minAgeMonths 0 — any
  // animal with a recorded sex and birth date resolves into it.
  await page.goto("/settings/categories");
  await page.getByLabel("Nombre").fill("Ternero E2E Edad");
  await page.getByLabel("Edad mínima (meses)").fill("0");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Ternero E2E Edad")).toBeVisible();
  // A second, unrelated category to pick as "Categoría destino" in the
  // recategorize form — irrelevant to this animal, since its row resolves
  // by age, but the form still requires picking one to enable "Subir".
  await page.getByLabel("Nombre").fill("Vaca E2E Edad");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Vaca E2E Edad")).toBeVisible();

  const OWN_TAG_AGE = "700000000701";

  // Register the tag with sex + birth date, but no category — this is the
  // "no category, resolve by age" case.
  await page.goto("/settings/dicose");
  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("Código DICOSE").fill("160099912");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("160099912")).toBeVisible();

  await page.goto("/settings/own-tags");
  const ownTagsPath = path.join(os.tmpdir(), "recategorize-e2e-age-own-tags.xlsx");
  await writeExcel(ownTagsPath, ["Caravana", "Sexo", "FechaNacimiento"], [[OWN_TAG_AGE, "macho", "2023-01-01"]]);
  await page.getByLabel("Registro DICOSE").selectOption({ label: "Pérez — Campo Norte (160099912)" });
  await page.getByLabel("Archivo").setInputFiles(ownTagsPath);
  await page.getByRole("button", { name: "Subir" }).click();

  await page.getByLabel("Caravana", { exact: true }).selectOption("tag");
  await page.getByLabel("Sexo", { exact: true }).selectOption("sex");
  await page.getByLabel("FechaNacimiento", { exact: true }).selectOption("birthDate");
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.getByRole("button", { name: "Confirmar carga" }).click();
  await expect(page.getByText(/1 caravanas registradas/)).toBeVisible();

  // Move it onto a real farm (no category column this time), so
  // animal_current_state has a current_farm_id but current_category_id null.
  const transferPath = path.join(os.tmpdir(), "recategorize-e2e-age-transfer.xlsx");
  await writeExcel(transferPath, ["Caravana", "Fecha"], [[OWN_TAG_AGE, "2026-01-01"]]);

  await page.goto("/activities/transfer");
  await page.getByLabel("Campo destino", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel(/archivo/i).setInputFiles(transferPath);
  await page.getByRole("button", { name: /^subir$/i }).click();
  await page.getByLabel("Caravana", { exact: true }).selectOption("tag");
  await page.getByLabel("Fecha", { exact: true }).selectOption("date");
  await page.getByRole("button", { name: /continuar/i }).click();
  await expect(page.getByText(OWN_TAG_AGE)).toBeVisible();
  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  // Recategorize: no farm to pick, and the row resolves by age even though
  // "Categoría destino" is set to something unrelated.
  const recatPath = path.join(os.tmpdir(), "recategorize-e2e-age-recat.xlsx");
  await writeExcel(recatPath, ["Caravana", "Fecha"], [[OWN_TAG_AGE, "2026-06-01"]]);

  await page.goto("/activities/recategorize");
  await expect(page.getByLabel("Campo")).toHaveCount(0);
  await page.getByLabel("Categoría destino").selectOption({ label: "Vaca E2E Edad" });
  await page.getByLabel(/archivo/i).setInputFiles(recatPath);
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("Caravana", { exact: true }).selectOption("tag");
  await page.getByLabel("Fecha", { exact: true }).selectOption("date");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText(OWN_TAG_AGE)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ternero E2E Edad" })).toBeVisible();
  await expect(page.getByText("OK (por edad)")).toBeVisible();

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  fs.unlinkSync(ownTagsPath);
  fs.unlinkSync(transferPath);
  fs.unlinkSync(recatPath);
});

test("assigns the target category to an animal whose age can't be computed", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // A plain, non-age-managed category: the row can only reach it through the
  // "Asignar categoría destino" decision, never through age resolution.
  await page.goto("/settings/categories");
  await page.getByLabel("Nombre").fill("Vaquillona E2E Sin Edad");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Vaquillona E2E Sin Edad")).toBeVisible();

  const OWN_TAG_NO_AGE = "700000000702";

  await page.goto("/settings/dicose");
  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("Código DICOSE").fill("160099913");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("160099913")).toBeVisible();

  // Sex but deliberately NO birth date: with no birth date the animal's age
  // can never be computed, so a row for it can only ever come back as
  // "Sin edad calculable".
  await page.goto("/settings/own-tags");
  const ownTagsPath = path.join(os.tmpdir(), "recategorize-e2e-noage-own-tags.xlsx");
  await writeExcel(ownTagsPath, ["Caravana", "Sexo"], [[OWN_TAG_NO_AGE, "hembra"]]);
  await page.getByLabel("Registro DICOSE").selectOption({ label: "Pérez — Campo Norte (160099913)" });
  await page.getByLabel("Archivo").setInputFiles(ownTagsPath);
  await page.getByRole("button", { name: "Subir" }).click();

  // Same ordering-independent handling as the first test: this header
  // signature may or may not already be mapped by a previous spec.
  const ownTagsTagSelect = page.getByLabel("Caravana", { exact: true });
  const ownTagsConfirm = page.getByRole("button", { name: "Confirmar carga" });
  await Promise.race([ownTagsTagSelect.waitFor({ state: "visible" }), ownTagsConfirm.waitFor({ state: "visible" })]);
  if (await ownTagsTagSelect.isVisible()) {
    await ownTagsTagSelect.selectOption("tag");
    await page.getByLabel("Sexo", { exact: true }).selectOption("sex");
    await page.getByRole("button", { name: /continuar/i }).click();
    await ownTagsConfirm.waitFor({ state: "visible" });
  }
  await ownTagsConfirm.click();
  await expect(page.getByText(/1 caravanas registradas/)).toBeVisible();

  // Move it onto a campo with no category column, so animal_current_state has
  // a current_farm_id and a null current_category_id.
  const transferPath = path.join(os.tmpdir(), "recategorize-e2e-noage-transfer.xlsx");
  await writeExcel(transferPath, ["Caravana", "Fecha"], [[OWN_TAG_NO_AGE, "2026-01-01"]]);

  await page.goto("/activities/transfer");
  await page.getByLabel("Campo destino", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel(/archivo/i).setInputFiles(transferPath);
  await page.getByRole("button", { name: /^subir$/i }).click();
  const transferTagSelect = page.getByLabel("Caravana", { exact: true });
  const transferTagCell = page.getByText(OWN_TAG_NO_AGE);
  await Promise.race([transferTagSelect.waitFor({ state: "visible" }), transferTagCell.waitFor({ state: "visible" })]);
  if (await transferTagSelect.isVisible()) {
    await transferTagSelect.selectOption("tag");
    await page.getByLabel("Fecha", { exact: true }).selectOption("date");
    await page.getByRole("button", { name: /continuar/i }).click();
  }
  await expect(page.getByText(OWN_TAG_NO_AGE)).toBeVisible();
  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  // Recategorize: the row has neither a category nor a computable age, so it
  // shows the per-row decision selector.
  const recatPath = path.join(os.tmpdir(), "recategorize-e2e-noage-recat.xlsx");
  await writeExcel(recatPath, ["Caravana", "Fecha"], [[OWN_TAG_NO_AGE, "2026-06-01"]]);

  await page.goto("/activities/recategorize");
  await page.getByLabel("Categoría destino").selectOption({ label: "Vaquillona E2E Sin Edad" });
  await page.getByLabel(/archivo/i).setInputFiles(recatPath);
  await page.getByRole("button", { name: /^subir$/i }).click();

  const recatTagSelect = page.getByLabel("Caravana", { exact: true });
  const decisionSelect = page.getByLabel(`Decisión para ${OWN_TAG_NO_AGE}`);
  await Promise.race([recatTagSelect.waitFor({ state: "visible" }), decisionSelect.waitFor({ state: "visible" })]);
  if (await recatTagSelect.isVisible()) {
    await recatTagSelect.selectOption("tag");
    await page.getByLabel("Fecha", { exact: true }).selectOption("date");
    await page.getByRole("button", { name: /continuar/i }).click();
  }

  await expect(page.getByText(OWN_TAG_NO_AGE)).toBeVisible();
  await expect(page.getByText("Sin edad calculable")).toBeVisible();

  // Default decision is "Omitir", which leaves nothing to confirm.
  await expect(page.getByRole("button", { name: /^confirmar$/i })).toBeDisabled();
  await decisionSelect.selectOption("assignTarget");
  await expect(page.getByRole("cell", { name: "Vaquillona E2E Sin Edad" })).toBeVisible();

  await page.getByRole("button", { name: /^confirmar$/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  fs.unlinkSync(ownTagsPath);
  fs.unlinkSync(transferPath);
  fs.unlinkSync(recatPath);
});
