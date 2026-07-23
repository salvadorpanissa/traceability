import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { testDb } from "../../test/db";
import { testReportingPool } from "../../test/reporting-db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import { role, farm, userAccount, userFarm, animal, batchOperation, event, eventTransfer } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/db/reporting", () => ({ reportingPool: testReportingPool }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { runNaturalLanguageQuery } = await import("@/app/(protected)/dashboard/query-actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
  process.env.NL_QUERY_TEST_SQL_OVERRIDE = "SELECT status, count(*) as total FROM my_animal_state GROUP BY status";
  vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
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

  return { manager, admin };
}

describe("runNaturalLanguageQuery", () => {
  it("returns only the manager's farm data even when the generated SQL has no farm filter", async () => {
    const { manager } = await seedTwoFarmsWithOneAnimalEach();
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    const result = await runNaturalLanguageQuery("¿cuántos animales por estado?");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const total = result.rows.reduce((sum, row) => sum + Number(row.total), 0);
      expect(total).toBe(1);
    }
  });

  it("returns every farm's data for an admin with the same query", async () => {
    const { admin } = await seedTwoFarmsWithOneAnimalEach();
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, role: "admin" } } as never);

    const result = await runNaturalLanguageQuery("¿cuántos animales por estado?");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const total = result.rows.reduce((sum, row) => sum + Number(row.total), 0);
      expect(total).toBe(2);
    }
  });

  it("returns a generic error when the generated SQL fails validation", async () => {
    const { manager } = await seedTwoFarmsWithOneAnimalEach();
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);
    process.env.NL_QUERY_TEST_SQL_OVERRIDE = "DROP TABLE my_animal_state";

    const result = await runNaturalLanguageQuery("borrá todo");

    expect(result).toEqual({ status: "error", messageKey: "cantGenerate" });
  });
});
