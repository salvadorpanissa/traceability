// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import { role, farm, userAccount, userFarm, animal, animalTagHistory, batchOperation, event, eventTransfer, eventRetag } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { findStaleTags } = await import("@/lib/dashboard/stale-tag-summary");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });
  return { manager, seededFarm };
}

function daysAgoISODate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function seedAnimalWithLastEvent(tag: string, farmId: string, createdBy: string, eventDate: string) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });

  // Create self-retag event to make the tag appear in animal_current_state.current_tag
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "retag", farmId, animalCount: 1, createdBy })
    .returning();
  const [retagEvent] = await testDb
    .insert(event)
    .values({ eventType: "retag", eventDate, animalId: createdAnimal.id, farmId, batchOperationId: batch.id, createdBy })
    .returning();
  await testDb.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: tag, newTag: tag });

  // Then add transfer event
  const [transferBatch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", farmId, animalCount: 1, createdBy })
    .returning();
  const [transferEvent] = await testDb
    .insert(event)
    .values({ eventType: "transfer", eventDate, animalId: createdAnimal.id, farmId, batchOperationId: transferBatch.id, createdBy })
    .returning();
  await testDb.insert(eventTransfer).values({ eventId: transferEvent.id, originFarmId: farmId, destinationFarmId: farmId, originPaddockId: null, destinationPaddockId: null });

  await refreshDerivedState();
  return createdAnimal;
}

describe("findStaleTags", () => {
  it("includes an animal whose last event is older than the threshold", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAnimalWithLastEvent("AR000000000920", seededFarm.id, manager.id, daysAgoISODate(150));

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).toContain("AR000000000920");
    expect(rows[0].daysSinceLastEvent).toBeGreaterThanOrEqual(150);
    expect(rows[0].lastEventType).toBe("transfer");
  });

  it("excludes an animal whose last event is within the threshold", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAnimalWithLastEvent("AR000000000921", seededFarm.id, manager.id, daysAgoISODate(10));

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).not.toContain("AR000000000921");
  });

  it("orders by days since last event, descending", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAnimalWithLastEvent("AR000000000922", seededFarm.id, manager.id, daysAgoISODate(120));
    await seedAnimalWithLastEvent("AR000000000923", seededFarm.id, manager.id, daysAgoISODate(200));

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).toEqual(["AR000000000923", "AR000000000922"]);
  });

  it("scopes results to the manager's assigned campos", async () => {
    const { manager } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    await seedAnimalWithLastEvent("AR000000000924", otherFarm.id, manager.id, daysAgoISODate(150));

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).not.toContain("AR000000000924");
  });
});
