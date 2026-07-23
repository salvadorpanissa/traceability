import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import {
  role,
  farm,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  paddock,
  category,
  eventRetag,
  eventRecategorize,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { requireTransferAuthorization, visibleCurrentState, visibleCurrentStateWithNames, findAnimalLocationByTag } =
  await import("@/lib/dal/animal-access");

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
    await refreshDerivedState();

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

describe("visibleCurrentStateWithNames", () => {
  it("resolves farm, paddock, and category names for an animal with all three set", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [seededPaddock] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero 1" }).returning();
    const [seededCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000040" });

    const [retagBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "retag", farmId: seededFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [retagEvent] = await testDb
      .insert(event)
      .values({
        eventType: "retag",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: retagBatch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventRetag)
      .values({ eventId: retagEvent.id, oldTag: "AR000000000040", newTag: "AR000000000040" });

    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb.insert(eventTransfer).values({
      eventId: transferEvent.id,
      originFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: seededPaddock.id,
    });

    const [recatBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "recategorize", farmId: seededFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [recatEvent] = await testDb
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: "2026-01-02",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: recatBatch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventRecategorize)
      .values({ eventId: recatEvent.id, oldCategoryId: seededCategory.id, newCategoryId: seededCategory.id });
    await refreshDerivedState();

    const rows = await visibleCurrentStateWithNames(admin.id, "admin");
    expect(rows).toEqual([
      {
        animalId: createdAnimal.id,
        currentTag: "AR000000000040",
        currentFarmId: seededFarm.id,
        farmName: "Campo Norte",
        currentPaddockId: seededPaddock.id,
        paddockName: "Potrero 1",
        currentCategoryId: seededCategory.id,
        categoryName: "Vaca",
        status: "alive",
      },
    ]);
  });

  it("leaves paddock and category names null when unset", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: transferEvent.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id });
    await refreshDerivedState();

    const rows = await visibleCurrentStateWithNames(admin.id, "admin");
    expect(rows[0].paddockName).toBeNull();
    expect(rows[0].categoryName).toBeNull();
  });

  it("scopes results to the manager's assigned farm", async () => {
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
    await refreshDerivedState();

    const rows = await visibleCurrentStateWithNames(manager.id, "manager");
    expect(rows).toHaveLength(1);
    expect(rows[0].farmName).toBe("Campo Norte");
  });
});

describe("findAnimalLocationByTag", () => {
  async function seedAnimalAtFarm(farmId: string, adminId: string, tag: string) {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });

    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId, animalCount: 1, createdBy: adminId })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId,
        batchOperationId: batch.id,
        createdBy: adminId,
      })
      .returning();
    await testDb.insert(eventTransfer).values({ eventId: transferEvent.id, originFarmId: farmId, destinationFarmId: farmId });

    const [retagBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "retag", farmId, animalCount: 1, createdBy: adminId })
      .returning();
    const [retagEvent] = await testDb
      .insert(event)
      .values({
        eventType: "retag",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId,
        batchOperationId: retagBatch.id,
        createdBy: adminId,
      })
      .returning();
    await testDb.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: tag, newTag: tag });

    await refreshDerivedState();
    return createdAnimal;
  }

  it("finds an animal by its current tag", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const createdAnimal = await seedAnimalAtFarm(seededFarm.id, admin.id, "AR000000000050");

    const result = await findAnimalLocationByTag(admin.id, "admin", "AR000000000050");
    expect(result).toMatchObject({ animalId: createdAnimal.id, currentTag: "AR000000000050", farmName: "Campo Norte" });
  });

  it("finds an animal by a past tag, returning its current tag and location", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const createdAnimal = await seedAnimalAtFarm(seededFarm.id, admin.id, "AR000000000051");
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000099" });
    const [retagBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "retag", farmId: seededFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [retagEvent] = await testDb
      .insert(event)
      .values({
        eventType: "retag",
        eventDate: "2026-02-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: retagBatch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventRetag)
      .values({ eventId: retagEvent.id, oldTag: "AR000000000051", newTag: "AR000000000099" });
    await refreshDerivedState();

    const result = await findAnimalLocationByTag(admin.id, "admin", "AR000000000051");
    expect(result?.currentTag).toBe("AR000000000099");
  });

  it("returns null for a tag that was never registered", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();

    expect(await findAnimalLocationByTag(admin.id, "admin", "AR999999999999")).toBeNull();
  });

  it("returns null for a manager searching a tag outside their assigned farms", async () => {
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
    await seedAnimalAtFarm(farmSur.id, admin.id, "AR000000000052");

    expect(await findAnimalLocationByTag(manager.id, "manager", "AR000000000052")).toBeNull();
  });

  it("finds a tag on the manager's own assigned farm", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: farmNorte.id });
    await seedAnimalAtFarm(farmNorte.id, admin.id, "AR000000000053");

    const result = await findAnimalLocationByTag(manager.id, "manager", "AR000000000053");
    expect(result?.farmName).toBe("Campo Norte");
  });
});
