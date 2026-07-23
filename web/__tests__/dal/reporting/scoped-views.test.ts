import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { testReportingPool } from "../../../test/reporting-db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  role,
  farm,
  userAccount,
  userFarm,
  animal,
  batchOperation,
  event,
  eventTransfer,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/db/reporting", () => ({ reportingPool: testReportingPool }));

const { withScopedReportingViews, REPORTING_VIEW_NAMES } = await import("@/lib/dal/reporting/scoped-views");

beforeEach(async () => {
  await resetTestDb();
});

async function seedTwoFarmsWithOneAnimalEach() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: farmNorte.id });

  for (const targetFarm of [farmNorte, farmSur]) {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: targetFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [createdEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: targetFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: createdEvent.id, originFarmId: targetFarm.id, destinationFarmId: targetFarm.id });
  }

  // animal_current_state is a materialized view refreshed explicitly by app
  // code after batches (see lib/activities/transfer.ts); tests that seed
  // event/event_transfer rows directly must refresh it before reading.
  await refreshDerivedState();

  return { manager, admin, farmNorte, farmSur };
}

describe("withScopedReportingViews", () => {
  it("scopes my_animal_state and my_transfer_events to the manager's farm only", async () => {
    const { manager, farmNorte } = await seedTwoFarmsWithOneAnimalEach();

    const rows = await withScopedReportingViews(manager.id, "manager", async (client) => {
      const state = await client.query("SELECT * FROM my_animal_state");
      const transfers = await client.query("SELECT * FROM my_transfer_events");
      return { state: state.rows, transfers: transfers.rows };
    });

    expect(rows.state).toHaveLength(1);
    expect(rows.state[0].current_farm_id).toBe(farmNorte.id);
    expect(rows.transfers).toHaveLength(1);
    expect(rows.transfers[0].farm_id).toBe(farmNorte.id);
  });

  it("gives an admin every farm's rows with the same query", async () => {
    const { admin } = await seedTwoFarmsWithOneAnimalEach();

    const rows = await withScopedReportingViews(admin.id, "admin", async (client) => {
      const state = await client.query("SELECT * FROM my_animal_state");
      return state.rows;
    });

    expect(rows).toHaveLength(2);
  });

  it("exposes exactly the 12 curated view names", () => {
    expect([...REPORTING_VIEW_NAMES].sort()).toEqual(
      [
        "my_animal_state",
        "my_farms",
        "my_paddocks",
        "my_categories",
        "my_products",
        "my_owners",
        "my_transfer_events",
        "my_health_events",
        "my_retag_events",
        "my_recategorize_events",
        "my_sale_events",
        "my_death_events",
      ].sort()
    );
  });
});
