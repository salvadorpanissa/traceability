import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import {
  category,
  role,
  farm,
  userAccount,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventRecategorize,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listCategories, listAllCategories, createCategory, updateCategory, setCategoryActive, countAliveAnimalsByCategory } =
  await import("@/lib/dal/category-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listCategories", () => {
  it("lists every active category ordered by name", async () => {
    await testDb.insert(category).values([{ name: "Toro" }, { name: "Vaca" }]);

    const categories = await listCategories();

    expect(categories).toEqual([
      { id: expect.any(String), name: "Toro", sex: null, minAgeMonths: null, active: true },
      { id: expect.any(String), name: "Vaca", sex: null, minAgeMonths: null, active: true },
    ]);
  });

  it("excludes archived categories", async () => {
    await testDb.insert(category).values([{ name: "Toro" }, { name: "Vaca", active: false }]);

    const categories = await listCategories();

    expect(categories.map((c) => c.name)).toEqual(["Toro"]);
  });
});

describe("listAllCategories", () => {
  it("includes archived categories alongside active ones", async () => {
    await testDb.insert(category).values([{ name: "Toro" }, { name: "Vaca", active: false }]);

    const categories = await listAllCategories();

    expect(categories.map((c) => ({ name: c.name, active: c.active }))).toEqual([
      { name: "Toro", active: true },
      { name: "Vaca", active: false },
    ]);
  });
});

describe("createCategory", () => {
  it("creates a category with sex/minAgeMonths null when omitted, active by default", async () => {
    const created = await createCategory({ name: "Vaca" });

    expect(created).toEqual({ id: expect.any(String), name: "Vaca", sex: null, minAgeMonths: null, active: true });
  });

  it("creates an age-managed category scoped to a sex", async () => {
    const created = await createCategory({ name: "Novillo +3 años", sex: "male", minAgeMonths: 36 });

    expect(created).toEqual({
      id: expect.any(String),
      name: "Novillo +3 años",
      sex: "male",
      minAgeMonths: 36,
      active: true,
    });
  });

  it("rejects a duplicate name", async () => {
    await createCategory({ name: "Vaca" });
    await expect(createCategory({ name: "Vaca" })).rejects.toThrow();
  });
});

describe("updateCategory", () => {
  it("updates the name", async () => {
    const created = await createCategory({ name: "Vaca" });

    const updated = await updateCategory(created.id, { name: "Vaca de invernada" });

    expect(updated).toEqual({
      id: created.id,
      name: "Vaca de invernada",
      sex: null,
      minAgeMonths: null,
      active: true,
    });

    const [stored] = await testDb.select().from(category).where(eq(category.id, created.id));
    expect(stored.name).toBe("Vaca de invernada");
  });

  it("updates sex and minAgeMonths", async () => {
    const created = await createCategory({ name: "Vaquillona 1 a 2 años" });

    const updated = await updateCategory(created.id, {
      name: "Vaquillona 1 a 2 años",
      sex: "female",
      minAgeMonths: 12,
    });

    expect(updated.sex).toBe("female");
    expect(updated.minAgeMonths).toBe(12);
  });

  it("rejects renaming into a name that already exists", async () => {
    await createCategory({ name: "Vaca" });
    const created = await createCategory({ name: "Toro" });

    await expect(updateCategory(created.id, { name: "Vaca" })).rejects.toThrow();
  });
});

describe("setCategoryActive", () => {
  it("archives a category, hiding it from listCategories but not listAllCategories", async () => {
    const created = await createCategory({ name: "Vaca" });

    await setCategoryActive(created.id, false);

    expect(await listCategories()).toEqual([]);
    const all = await listAllCategories();
    expect(all).toEqual([{ ...created, active: false }]);
  });

  it("reactivates an archived category", async () => {
    const created = await createCategory({ name: "Vaca" });
    await setCategoryActive(created.id, false);

    await setCategoryActive(created.id, true);

    expect((await listCategories()).map((c) => c.id)).toContain(created.id);
  });
});

describe("countAliveAnimalsByCategory", () => {
  async function seedAliveAnimalInCategory(farmId: string, adminId: string, categoryId: string, tag: string) {
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

    const [recatBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "recategorize", farmId, animalCount: 1, createdBy: adminId })
      .returning();
    const [recatEvent] = await testDb
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId,
        batchOperationId: recatBatch.id,
        createdBy: adminId,
      })
      .returning();
    await testDb
      .insert(eventRecategorize)
      .values({ eventId: recatEvent.id, oldCategoryId: categoryId, newCategoryId: categoryId });

    return createdAnimal;
  }

  it("counts only alive animals, grouped by their current category", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const [categoryA] = await testDb.insert(category).values({ name: "Ternera" }).returning();
    const [categoryB] = await testDb.insert(category).values({ name: "Vaca de cría" }).returning();

    await seedAliveAnimalInCategory(seededFarm.id, admin.id, categoryA.id, "AR000000000080");
    await seedAliveAnimalInCategory(seededFarm.id, admin.id, categoryA.id, "AR000000000081");
    await seedAliveAnimalInCategory(seededFarm.id, admin.id, categoryB.id, "AR000000000082");
    await refreshDerivedState();

    const counts = await countAliveAnimalsByCategory();

    expect(counts.get(categoryA.id)).toBe(2);
    expect(counts.get(categoryB.id)).toBe(1);
  });
});
