// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farm, role, establishment, userAccount, animal, batchOperation, event, eventHealth, product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { visibleHealthBatchesSince, countDistinctAnimalsTreatedSince } = await import("@/lib/dashboard/health-batch-summary");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmUserAnimal() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [seededFarm] = await testDb.insert(establishment).values({ farmId: seededFarmGroup.id, name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  const [productA] = await testDb.insert(product).values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" }).returning();
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "health", establishmentId: seededFarm.id, animalCount: 1, createdBy: user.id })
    .returning();
  return { seededFarm, seededFarmGroup, user, createdAnimal, productA, batch };
}

async function seedHealthEvent(
  animalId: string,
  establishmentId: string,
  batchId: string,
  userId: string,
  productId: string,
  eventDate: string,
  voided = false
) {
  const [healthEvent] = await testDb
    .insert(event)
    .values({ eventType: "health", eventDate, animalId, establishmentId, batchOperationId: batchId, createdBy: userId })
    .returning();
  await testDb.insert(eventHealth).values({
    eventId: healthEvent.id,
    productId,
    dose: "10",
    doseUnit: "ml",
    route: "subcutánea",
    withdrawalDays: null,
  });
  if (voided) {
    await testDb.insert(event).values({
      eventType: "void",
      eventDate,
      animalId,
      establishmentId,
      batchOperationId: batchId,
      createdBy: userId,
      voidsEventId: healthEvent.id,
    });
  }
  return healthEvent;
}

describe("visibleHealthBatchesSince", () => {
  it("lists a health batch", async () => {
    const { seededFarm, user, createdAnimal, productA, batch } = await seedFarmUserAnimal();
    await seedHealthEvent(createdAnimal.id, seededFarm.id, batch.id, user.id, productA.id, "2026-02-01");

    const result = await visibleHealthBatchesSince(user.id, "admin", "2026-01-01");

    expect(result).toEqual([
      {
        batchId: batch.id,
        eventDate: "2026-02-01",
        establishmentName: "Campo Norte",
        paddockName: null,
        productName: "Ivermectina 1%",
        animalCount: 1,
      },
    ]);
  });

  it("omits a batch whose only health event was voided — e.g. a sanidad confirmed twice by mistake", async () => {
    const { seededFarm, user, createdAnimal, productA, batch } = await seedFarmUserAnimal();
    await seedHealthEvent(createdAnimal.id, seededFarm.id, batch.id, user.id, productA.id, "2026-02-01", true);

    const result = await visibleHealthBatchesSince(user.id, "admin", "2026-01-01");

    expect(result).toEqual([]);
  });
});

describe("countDistinctAnimalsTreatedSince", () => {
  it("does not count an animal whose only health event was voided", async () => {
    const { seededFarm, user, createdAnimal, productA, batch } = await seedFarmUserAnimal();
    await seedHealthEvent(createdAnimal.id, seededFarm.id, batch.id, user.id, productA.id, "2026-02-01", true);

    const result = await countDistinctAnimalsTreatedSince(user.id, "admin", "2026-01-01");

    expect(Number(result)).toBe(0);
  });
});
