import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, category, batchOperation, event, eventRetag, eventRecategorize, animalTagHistory } from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { createNewAnimal } = await import("@/lib/activities/animal-creation");

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
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "health", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
    .returning();
  return { seededFarm, user, batch };
}

describe("createNewAnimal", () => {
  it("creates the animal, its tag history, and a self-retag event", async () => {
    const { seededFarm, user, batch } = await seedFarmAndUser();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000060",
      eventDate: "2026-02-01",
      status: "new",
      categoryId: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, { userId: user.id, operatingFarmId: seededFarm.id, batchId: batch.id, row })
    );

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.animalId, animalId));
    expect(tagRow.tag).toBe("AR000000000060");

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("retag");

    const [retag] = await testDb.select().from(eventRetag).where(eq(eventRetag.eventId, events[0].id));
    expect(retag.oldTag).toBe("AR000000000060");
    expect(retag.newTag).toBe("AR000000000060");
  });

  it("also creates a self-recategorize event when the row carries a category", async () => {
    const { seededFarm, user, batch } = await seedFarmAndUser();
    const [createdCategory] = await testDb.insert(category).values({ name: "Ternero" }).returning();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000061",
      eventDate: "2026-02-01",
      status: "new",
      categoryId: createdCategory.id,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, { userId: user.id, operatingFarmId: seededFarm.id, batchId: batch.id, row })
    );

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events.map((e) => e.eventType).sort()).toEqual(["recategorize", "retag"]);

    const recategorizeEvent = events.find((e) => e.eventType === "recategorize")!;
    const [recategorize] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, recategorizeEvent.id));
    expect(recategorize.newCategoryId).toBe(createdCategory.id);
  });
});
