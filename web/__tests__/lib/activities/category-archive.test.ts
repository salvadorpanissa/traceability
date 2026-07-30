import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  role,
  farm,
  userAccount,
  category,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventRecategorize,
  eventDeath,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { archiveCategory } = await import("@/lib/activities/category-archive");
const { listCategories, listAllCategories } = await import("@/lib/dal/category-catalog");

async function seedFarmAndAdmin(farmName = "Campo Norte") {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: farmName }).returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { admin, seededFarm };
}

async function seedAnimal(input: {
  farmId: string;
  adminId: string;
  tag: string;
  initialCategoryId: string;
  dead?: boolean;
}) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: input.tag });

  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", farmId: input.farmId, animalCount: 1, createdBy: input.adminId })
    .returning();
  const [transferEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2020-01-01",
      animalId: createdAnimal.id,
      farmId: input.farmId,
      batchOperationId: batch.id,
      createdBy: input.adminId,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({ eventId: transferEvent.id, originFarmId: input.farmId, destinationFarmId: input.farmId });

  const [recategorizeEvent] = await testDb
    .insert(event)
    .values({
      eventType: "recategorize",
      eventDate: "2020-01-01",
      animalId: createdAnimal.id,
      farmId: input.farmId,
      batchOperationId: batch.id,
      createdBy: input.adminId,
    })
    .returning();
  await testDb.insert(eventRecategorize).values({
    eventId: recategorizeEvent.id,
    oldCategoryId: input.initialCategoryId,
    newCategoryId: input.initialCategoryId,
    source: "initial",
  });

  if (input.dead) {
    const [deathEvent] = await testDb
      .insert(event)
      .values({
        eventType: "death",
        eventDate: "2021-01-01",
        animalId: createdAnimal.id,
        farmId: input.farmId,
        batchOperationId: batch.id,
        createdBy: input.adminId,
      })
      .returning();
    await testDb.insert(eventDeath).values({ eventId: deathEvent.id });
  }

  await refreshDerivedState();
  return createdAnimal;
}

beforeEach(async () => {
  await resetTestDb();
});

describe("archiveCategory", () => {
  it("moves every alive animal to the target category, archives the source, and leaves it out of listCategories", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    const [target] = await testDb.insert(category).values({ name: "Vaquillona" }).returning();
    const a1 = await seedAnimal({ farmId: seededFarm.id, adminId: admin.id, tag: "AR1", initialCategoryId: source.id });
    const a2 = await seedAnimal({ farmId: seededFarm.id, adminId: admin.id, tag: "AR2", initialCategoryId: source.id });

    const result = await archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: target.id });

    expect(result).toEqual({ reassigned: 2 });

    const stateResult = await testDb.execute<{ animal_id: string; current_category_id: string | null }>(
      sql`select animal_id, current_category_id from animal_current_state where animal_id in (${a1.id}, ${a2.id})`
    );
    for (const row of stateResult.rows) {
      expect(row.current_category_id).toBe(target.id);
    }

    const names = (await listCategories()).map((c) => c.name);
    expect(names).not.toContain("Ternera");
    expect(names).toContain("Vaquillona");

    const all = await listAllCategories();
    const archived = all.find((c) => c.id === source.id)!;
    expect(archived.active).toBe(false);
  });

  it("records the reassignment as a manual recategorize event", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    const [target] = await testDb.insert(category).values({ name: "Vaquillona" }).returning();
    const a1 = await seedAnimal({ farmId: seededFarm.id, adminId: admin.id, tag: "AR3", initialCategoryId: source.id });

    await archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: target.id });

    const events = await testDb.select().from(event).where(eq(event.animalId, a1.id));
    const newRecategorizeEvent = events
      .filter((e) => e.eventType === "recategorize")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .at(-1)!;
    const [recategorizeRow] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, newRecategorizeEvent.id));
    expect(recategorizeRow.oldCategoryId).toBe(source.id);
    expect(recategorizeRow.newCategoryId).toBe(target.id);
    expect(recategorizeRow.source).toBe("manual");
  });

  it("creates one batchOperation per farm when animals span multiple farms", async () => {
    const { admin, seededFarm: farmA } = await seedFarmAndAdmin("Campo A");
    const [farmB] = await testDb.insert(farm).values({ name: "Campo B" }).returning();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    const [target] = await testDb.insert(category).values({ name: "Vaquillona" }).returning();
    await seedAnimal({ farmId: farmA.id, adminId: admin.id, tag: "AR4", initialCategoryId: source.id });
    await seedAnimal({ farmId: farmB.id, adminId: admin.id, tag: "AR5", initialCategoryId: source.id });

    await archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: target.id });

    const batches = await testDb.select().from(batchOperation).where(eq(batchOperation.eventType, "recategorize"));
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.farmId).sort()).toEqual([farmA.id, farmB.id].sort());
  });

  it("leaves dead/sold animals' category untouched", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    const [target] = await testDb.insert(category).values({ name: "Vaquillona" }).returning();
    const deadAnimal = await seedAnimal({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR6",
      initialCategoryId: source.id,
      dead: true,
    });

    const result = await archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: target.id });

    expect(result).toEqual({ reassigned: 0 });
    const stateResult = await testDb.execute<{ current_category_id: string | null }>(
      sql`select current_category_id from animal_current_state where animal_id = ${deadAnimal.id}`
    );
    expect(stateResult.rows[0].current_category_id).toBe(source.id);
  });

  it("requires a target category when the source has alive animals", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    await seedAnimal({ farmId: seededFarm.id, adminId: admin.id, tag: "AR7", initialCategoryId: source.id });

    await expect(
      archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: null })
    ).rejects.toThrow();
  });

  it("rejects archiving into itself", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    await seedAnimal({ farmId: seededFarm.id, adminId: admin.id, tag: "AR8", initialCategoryId: source.id });

    await expect(
      archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: source.id })
    ).rejects.toThrow();
  });

  it("rejects a target category that is itself archived", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    const [target] = await testDb.insert(category).values({ name: "Vaquillona", active: false }).returning();
    await seedAnimal({ farmId: seededFarm.id, adminId: admin.id, tag: "AR9", initialCategoryId: source.id });

    await expect(
      archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: target.id })
    ).rejects.toThrow();
  });

  it("rejects an unknown target category", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [source] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    await seedAnimal({ farmId: seededFarm.id, adminId: admin.id, tag: "AR10", initialCategoryId: source.id });

    await expect(
      archiveCategory({ userId: admin.id, categoryId: source.id, targetCategoryId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow();
  });

  it("archives directly, with no target needed, when the category has no alive animals", async () => {
    const [source] = await testDb.insert(category).values({ name: "Toro" }).returning();

    const result = await archiveCategory({ userId: "u1", categoryId: source.id, targetCategoryId: null });

    expect(result).toEqual({ reassigned: 0 });
    const all = await listAllCategories();
    expect(all.find((c) => c.id === source.id)?.active).toBe(false);
  });
});
