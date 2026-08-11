import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import {
  farmGroup,
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

const {
  listCategoriesByGroup,
  listAllCategoriesByGroup,
  listAllCategoriesForGroups,
  createCategory,
  updateCategory,
  setCategoryActive,
  countAliveAnimalsByCategory,
} = await import("@/lib/dal/category-catalog");

beforeEach(async () => {
  await resetTestDb();
});

async function seedGroup(name = "Grupo") {
  const [group] = await testDb.insert(farmGroup).values({ name }).returning();
  return group;
}

describe("listCategoriesByGroup", () => {
  it("lists every active category in the grupo ordered by name", async () => {
    const group = await seedGroup();
    await testDb.insert(category).values([
      { groupId: group.id, name: "Toro" },
      { groupId: group.id, name: "Vaca" },
    ]);

    const categories = await listCategoriesByGroup(group.id);

    expect(categories).toEqual([
      {
        id: expect.any(String),
        groupId: group.id,
        name: "Toro",
        sex: null,
        minAgeMonths: null,
        active: true,
      },
      {
        id: expect.any(String),
        groupId: group.id,
        name: "Vaca",
        sex: null,
        minAgeMonths: null,
        active: true,
      },
    ]);
  });

  it("excludes archived categories", async () => {
    const group = await seedGroup();
    await testDb
      .insert(category)
      .values([
        { groupId: group.id, name: "Toro" },
        { groupId: group.id, name: "Vaca", active: false },
      ]);

    const categories = await listCategoriesByGroup(group.id);

    expect(categories.map((c) => c.name)).toEqual(["Toro"]);
  });

  it("does not include a category from a different grupo", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await testDb.insert(category).values({ groupId: groupB.id, name: "Vaca" });

    expect(await listCategoriesByGroup(groupA.id)).toEqual([]);
  });
});

describe("listAllCategoriesByGroup", () => {
  it("includes archived categories alongside active ones", async () => {
    const group = await seedGroup();
    await testDb
      .insert(category)
      .values([
        { groupId: group.id, name: "Toro" },
        { groupId: group.id, name: "Vaca", active: false },
      ]);

    const categories = await listAllCategoriesByGroup(group.id);

    expect(categories.map((c) => ({ name: c.name, active: c.active }))).toEqual([
      { name: "Toro", active: true },
      { name: "Vaca", active: false },
    ]);
  });
});

describe("listAllCategoriesForGroups", () => {
  it("lists categories across every grupo given", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await testDb.insert(category).values([
      { groupId: groupA.id, name: "Toro" },
      { groupId: groupB.id, name: "Vaca" },
    ]);

    const categories = await listAllCategoriesForGroups([groupA.id, groupB.id]);

    expect(categories.map((c) => c.name)).toEqual(["Toro", "Vaca"]);
  });
});

describe("createCategory", () => {
  it("creates a category with sex/minAgeMonths null when omitted, active by default", async () => {
    const group = await seedGroup();
    const created = await createCategory(group.id, { name: "Vaca" });

    expect(created).toEqual({
      id: expect.any(String),
      groupId: group.id,
      name: "Vaca",
      sex: null,
      minAgeMonths: null,
      active: true,
    });
  });

  it("creates an age-managed category scoped to a sex", async () => {
    const group = await seedGroup();
    const created = await createCategory(group.id, {
      name: "Novillo +3 años",
      sex: "male",
      minAgeMonths: 36,
    });

    expect(created).toEqual({
      id: expect.any(String),
      groupId: group.id,
      name: "Novillo +3 años",
      sex: "male",
      minAgeMonths: 36,
      active: true,
    });
  });

  it("rejects a duplicate name within the same grupo", async () => {
    const group = await seedGroup();
    await createCategory(group.id, { name: "Vaca" });
    await expect(createCategory(group.id, { name: "Vaca" })).rejects.toThrow();
  });

  it("allows the same name in a different grupo", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await createCategory(groupA.id, { name: "Vaca" });

    const created = await createCategory(groupB.id, { name: "Vaca" });
    expect(created.name).toBe("Vaca");
  });
});

describe("updateCategory", () => {
  it("updates the name", async () => {
    const group = await seedGroup();
    const created = await createCategory(group.id, { name: "Vaca" });

    const updated = await updateCategory(created.id, {
      name: "Vaca de invernada",
    });

    expect(updated).toEqual({
      id: created.id,
      groupId: group.id,
      name: "Vaca de invernada",
      sex: null,
      minAgeMonths: null,
      active: true,
    });

    const [stored] = await testDb
      .select()
      .from(category)
      .where(eq(category.id, created.id));
    expect(stored.name).toBe("Vaca de invernada");
  });

  it("updates sex and minAgeMonths", async () => {
    const group = await seedGroup();
    const created = await createCategory(group.id, { name: "Vaquillona 1 a 2 años" });

    const updated = await updateCategory(created.id, {
      name: "Vaquillona 1 a 2 años",
      sex: "female",
      minAgeMonths: 12,
    });

    expect(updated.sex).toBe("female");
    expect(updated.minAgeMonths).toBe(12);
  });

  it("rejects renaming into a name that already exists in the same grupo", async () => {
    const group = await seedGroup();
    await createCategory(group.id, { name: "Vaca" });
    const created = await createCategory(group.id, { name: "Toro" });

    await expect(
      updateCategory(created.id, { name: "Vaca" }),
    ).rejects.toThrow();
  });
});

describe("setCategoryActive", () => {
  it("archives a category, hiding it from listCategoriesByGroup but not listAllCategoriesByGroup", async () => {
    const group = await seedGroup();
    const created = await createCategory(group.id, { name: "Vaca" });

    await setCategoryActive(created.id, false);

    expect(await listCategoriesByGroup(group.id)).toEqual([]);
    const all = await listAllCategoriesByGroup(group.id);
    expect(all).toEqual([{ ...created, active: false }]);
  });

  it("reactivates an archived category", async () => {
    const group = await seedGroup();
    const created = await createCategory(group.id, { name: "Vaca" });
    await setCategoryActive(created.id, false);

    await setCategoryActive(created.id, true);

    expect((await listCategoriesByGroup(group.id)).map((c) => c.id)).toContain(created.id);
  });
});

describe("countAliveAnimalsByCategory", () => {
  async function seedAliveAnimalInCategory(
    farmId: string,
    adminId: string,
    categoryId: string,
    tag: string,
  ) {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag });

    const [batch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        farmId,
        animalCount: 1,
        createdBy: adminId,
      })
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
    await testDb
      .insert(eventTransfer)
      .values({
        eventId: transferEvent.id,
        originFarmId: farmId,
        destinationFarmId: farmId,
      });

    const [recatBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "recategorize",
        farmId,
        animalCount: 1,
        createdBy: adminId,
      })
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
      .values({
        eventId: recatEvent.id,
        oldCategoryId: categoryId,
        newCategoryId: categoryId,
      });

    return createdAnimal;
  }

  it("counts only alive animals, grouped by their current category", async () => {
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
      .returning();
    const [seededFarmGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "Campo Norte" })
      .returning();
    const [seededFarm] = await testDb
      .insert(farm)
      .values({ groupId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({
        name: "Admin",
        email: "admin@example.com",
        passwordHash: "hashed",
        roleId: adminRole.id,
      })
      .returning();
    const [categoryA] = await testDb
      .insert(category)
      .values({ groupId: seededFarmGroup.id, name: "Ternera" })
      .returning();
    const [categoryB] = await testDb
      .insert(category)
      .values({ groupId: seededFarmGroup.id, name: "Vaca de cría" })
      .returning();

    await seedAliveAnimalInCategory(
      seededFarm.id,
      admin.id,
      categoryA.id,
      "AR000000000080",
    );
    await seedAliveAnimalInCategory(
      seededFarm.id,
      admin.id,
      categoryA.id,
      "AR000000000081",
    );
    await seedAliveAnimalInCategory(
      seededFarm.id,
      admin.id,
      categoryB.id,
      "AR000000000082",
    );
    await refreshDerivedState();

    const counts = await countAliveAnimalsByCategory();

    expect(counts.get(categoryA.id)).toBe(2);
    expect(counts.get(categoryB.id)).toBe(1);
  });
});
