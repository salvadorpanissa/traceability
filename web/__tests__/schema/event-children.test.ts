import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  animal,
  batchOperation,
  event,
  category,
  product,
  eventTransfer,
  eventHealth,
  eventRetag,
  eventRecategorize,
  eventSale,
  eventDeath,
} from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function seedEvent(eventType: string) {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType, farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
    .returning();
  const [createdEvent] = await testDb
    .insert(event)
    .values({
      eventType,
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      farmId: seededFarm.id,
      batchOperationId: batch.id,
      createdBy: user.id,
    })
    .returning();
  return { seededFarm, createdEvent };
}

describe("event_transfer table", () => {
  it("stores origin/destination farms with an optional guide number", async () => {
    const { seededFarm, createdEvent } = await seedEvent("transfer");
    const [row] = await testDb
      .insert(eventTransfer)
      .values({ eventId: createdEvent.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id })
      .returning();
    expect(row.guideNumber).toBeNull();
  });
});

describe("event_health table", () => {
  it("stores dose/route with a required product and dose", async () => {
    const { createdEvent } = await seedEvent("health");
    const [createdProduct] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [row] = await testDb
      .insert(eventHealth)
      .values({ eventId: createdEvent.id, productId: createdProduct.id, dose: "10", doseUnit: "ml", route: "subcutánea" })
      .returning();
    expect(row.dose).toBe("10");
    expect(row.withdrawalDays).toBeNull();
  });
});

describe("event_retag table", () => {
  it("requires old and new tags", async () => {
    const { createdEvent } = await seedEvent("retag");
    const [row] = await testDb
      .insert(eventRetag)
      .values({ eventId: createdEvent.id, oldTag: "AR000000000001", newTag: "AR000000000002" })
      .returning();
    expect(row.newTag).toBe("AR000000000002");
  });
});

describe("event_recategorize table", () => {
  it("links old and new categories", async () => {
    const { createdEvent } = await seedEvent("recategorize");
    const [oldCategory] = await testDb.insert(category).values({ name: "Ternero" }).returning();
    const [newCategory] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [row] = await testDb
      .insert(eventRecategorize)
      .values({ eventId: createdEvent.id, oldCategoryId: oldCategory.id, newCategoryId: newCategory.id })
      .returning();
    expect(row.newCategoryId).toBe(newCategory.id);
  });
});

describe("event_sale table", () => {
  it("stores optional buyer/price/weight", async () => {
    const { createdEvent } = await seedEvent("sale");
    const [row] = await testDb.insert(eventSale).values({ eventId: createdEvent.id }).returning();
    expect(row.buyer).toBeNull();
    expect(row.price).toBeNull();
    expect(row.weightKg).toBeNull();
  });
});

describe("event_death table", () => {
  it("stores an optional cause", async () => {
    const { createdEvent } = await seedEvent("death");
    const [row] = await testDb.insert(eventDeath).values({ eventId: createdEvent.id }).returning();
    expect(row.cause).toBeNull();
  });
});
