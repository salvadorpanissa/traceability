// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import { role, farm, userAccount, userFarm, animal, animalTagHistory, batchOperation, event, eventTransfer, eventRetag } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { getStaleTagsAction } = await import("../../app/(protected)/dashboard/stale-tags-actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

function daysAgoISODate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

describe("getStaleTagsAction", () => {
  it("returns stale tags for the current session's user", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const tag = "AR000000000930";
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });

    // Create self-retag event to populate animal_current_state.current_tag
    const [retagBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "retag", farmId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [retagEvent] = await testDb
      .insert(event)
      .values({ eventType: "retag", eventDate: daysAgoISODate(150), animalId: createdAnimal.id, farmId: seededFarm.id, batchOperationId: retagBatch.id, createdBy: manager.id })
      .returning();
    await testDb.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: tag, newTag: tag });

    // Create transfer event
    const [transferBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({ eventType: "transfer", eventDate: daysAgoISODate(150), animalId: createdAnimal.id, farmId: seededFarm.id, batchOperationId: transferBatch.id, createdBy: manager.id })
      .returning();
    await testDb.insert(eventTransfer).values({ eventId: transferEvent.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id, originPaddockId: null, destinationPaddockId: null });

    await refreshDerivedState();

    const rows = await getStaleTagsAction(100);
    expect(rows.map((r) => r.currentTag)).toContain(tag);
  });
});
