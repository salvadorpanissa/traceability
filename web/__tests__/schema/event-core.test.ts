import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmAndUser() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { seededFarm, user };
}

describe("batch_operation table", () => {
  it("stores a batch operation tied to a farm and a creator", async () => {
    const { seededFarm, user } = await seedFarmAndUser();
    const [created] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    expect(created.animalCount).toBe(1);
    expect(created.selectionCriteria).toEqual({});
  });
});

describe("event table", () => {
  it("stores an event and enforces the event_type check constraint", async () => {
    const { seededFarm, user } = await seedFarmAndUser();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();

    const [created] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
      .returning();
    expect(created.eventType).toBe("transfer");
    expect(created.voidsEventId).toBeNull();

    await expect(
      testDb.insert(event).values({
        eventType: "not-a-real-type",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
    ).rejects.toThrow();
  });

  it("enforces voidsEventId is set only when eventType is void", async () => {
    const { seededFarm, user } = await seedFarmAndUser();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();

    // event_type = 'void' without voidsEventId must fail
    await expect(
      testDb.insert(event).values({
        eventType: "void",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
    ).rejects.toThrow();

    // event_type <> 'void' with voidsEventId set must fail
    const [firstEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
      .returning();

    await expect(
      testDb.insert(event).values({
        eventType: "transfer",
        eventDate: "2026-01-02",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
        voidsEventId: firstEvent.id,
      })
    ).rejects.toThrow();
  });
});
