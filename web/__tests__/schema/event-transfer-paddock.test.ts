import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event, eventTransfer, paddock } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("event_transfer paddock columns", () => {
  it("accepts origin/destination paddocks, both optional", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [potreroA] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero A" }).returning();
    const [potreroB] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero B" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [createdEvent] = await testDb
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

    const [withPaddocks] = await testDb
      .insert(eventTransfer)
      .values({
        eventId: createdEvent.id,
        originFarmId: seededFarm.id,
        destinationFarmId: seededFarm.id,
        originPaddockId: potreroA.id,
        destinationPaddockId: potreroB.id,
      })
      .returning();
    expect(withPaddocks.originPaddockId).toBe(potreroA.id);
    expect(withPaddocks.destinationPaddockId).toBe(potreroB.id);
  });
});
