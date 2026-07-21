import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, animal, batchOperation, event, eventTransfer } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { requireTransferAuthorization, visibleCurrentState } = await import("@/lib/dal/animal-access");

beforeEach(async () => {
  await resetTestDb();
});

describe("requireTransferAuthorization", () => {
  it("allows a same-farm transfer for a manager", () => {
    expect(() => requireTransferAuthorization("manager", "farm-a", "farm-a")).not.toThrow();
  });

  it("rejects a cross-farm transfer for a manager", () => {
    expect(() => requireTransferAuthorization("manager", "farm-a", "farm-b")).toThrow();
  });

  it("allows a cross-farm transfer for an admin", () => {
    expect(() => requireTransferAuthorization("admin", "farm-a", "farm-b")).not.toThrow();
  });
});

describe("visibleCurrentState", () => {
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

    return { manager, admin, farmNorte, farmSur };
  }

  it("scopes results to the manager's assigned farm", async () => {
    const { manager, farmNorte } = await seedTwoFarmsWithOneAnimalEach();
    const rows = await visibleCurrentState(manager.id, "manager");
    expect(rows).toHaveLength(1);
    expect(rows[0].currentFarmId).toBe(farmNorte.id);
  });

  it("returns every farm's animals for an admin", async () => {
    const { admin } = await seedTwoFarmsWithOneAnimalEach();
    const rows = await visibleCurrentState(admin.id, "admin");
    expect(rows).toHaveLength(2);
  });

  it("returns an empty array for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [unassignedManager] = await testDb
      .insert(userAccount)
      .values({ name: "Sin campo", email: "sincampo@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    const rows = await visibleCurrentState(unassignedManager.id, "manager");
    expect(rows).toEqual([]);
  });
});
