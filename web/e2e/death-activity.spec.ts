import { test, expect } from "@playwright/test";
import { Client } from "pg";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

// e2e/global-setup.ts only seeds roles/farm/admin-user/products/owners/
// paddock/own_tag rows — it never inserts anything into `animal`. Every
// other e2e spec that needs an animal creates one by uploading an Excel
// fixture through the UI, but the death flow only needs to look up a tag
// that's already alive, so it's simpler (and doesn't couple this spec to
// the transfer flow) to seed one directly against the test DB here, the
// same way __tests__/lib/activities/death-confirm.test.ts's
// seedAliveAnimal helper does it: an animal only shows up in
// animal_current_state with a farm once it has a transfer event, and that
// materialized view has to be refreshed manually since it's no longer
// kept up to date by per-row triggers (see test/refresh-derived-state.ts).
const DEATH_CANDIDATE_TAG = "AR000000000500";

async function seedAliveAnimal(tag: string) {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set");
  }

  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    const {
      rows: [{ id: farmId }],
    } = await client.query("select id from farm where name = 'Campo Norte'");
    const {
      rows: [{ id: adminId }],
    } = await client.query("select id from user_account where email = $1", [ADMIN_EMAIL]);

    const {
      rows: [{ id: animalId }],
    } = await client.query("insert into animal default values returning id");
    await client.query("insert into animal_tag_history (animal_id, tag) values ($1, $2)", [animalId, tag]);

    const {
      rows: [{ id: batchId }],
    } = await client.query(
      "insert into batch_operation (event_type, farm_id, animal_count, created_by) values ('transfer', $1, 1, $2) returning id",
      [farmId, adminId]
    );
    // Deliberately recent (not > the dashboard's stale-tag threshold, see
    // lib/dashboard/stale-tag-summary.ts's DEFAULT_STALE_TAG_THRESHOLD_DAYS
    // usage in app/(protected)/dashboard/page.tsx). If this animal ever
    // aged past the threshold, it would also surface in the dashboard's
    // "Noticias" stale-tag widget with its own "Registrar muerte" link —
    // that widget correctly resolves its tag from animal_tag_history, but
    // a second "Registrar muerte" link on the page would still make the
    // unscoped locator below ambiguous under Playwright's strict mode.
    // Keeping this seeded animal fresh avoids that collision.
    const {
      rows: [{ id: eventId }],
    } = await client.query(
      "insert into event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by) values ('transfer', current_date, $1, $2, $3, $4) returning id",
      [animalId, farmId, batchId, adminId]
    );
    await client.query(
      "insert into event_transfer (event_id, origin_farm_id, destination_farm_id, origin_paddock_id, destination_paddock_id) values ($1, $2, $2, null, null)",
      [eventId, farmId]
    );

    await client.query("refresh materialized view concurrently animal_current_state");
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  await seedAliveAnimal(DEATH_CANDIDATE_TAG);
});

test("registers a death for an existing caravana from the dashboard lookup", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const animalLookup = page.getByTestId("animal-lookup");
  await animalLookup.getByPlaceholder("Número de caravana").fill(DEATH_CANDIDATE_TAG);
  await animalLookup.getByRole("button", { name: "Buscar" }).click();

  const deathLink = animalLookup.getByRole("link", { name: "Registrar muerte" });
  await expect(deathLink).toBeVisible();
  await expect(deathLink).toHaveAttribute("href", `/activities/death?tag=${DEATH_CANDIDATE_TAG}`);
  await deathLink.click();
  await page.waitForURL(new RegExp(`/activities/death\\?tag=${DEATH_CANDIDATE_TAG}`));

  await expect(page.getByText("Campo Norte")).toBeVisible();
  await page.getByLabel(/causa/i).fill("Timpanismo");
  await page.getByRole("button", { name: /confirmar/i }).click();

  await expect(page.getByText("Muerte registrada.")).toBeVisible();
});
