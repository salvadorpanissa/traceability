import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { category } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listCategories, createCategory, updateCategory } = await import("@/lib/dal/category-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listCategories", () => {
  it("lists every category ordered by sortOrder", async () => {
    await testDb.insert(category).values([
      { name: "Toro", sortOrder: 2 },
      { name: "Vaca", sortOrder: 1 },
    ]);

    const categories = await listCategories();

    expect(categories).toEqual([
      { id: expect.any(String), name: "Vaca", sortOrder: 1, sex: null, minAgeMonths: null },
      { id: expect.any(String), name: "Toro", sortOrder: 2, sex: null, minAgeMonths: null },
    ]);
  });
});

describe("createCategory", () => {
  it("creates a category with sortOrder defaulting to 0 and sex/minAgeMonths null when omitted", async () => {
    const created = await createCategory({ name: "Vaca" });

    expect(created).toEqual({ id: expect.any(String), name: "Vaca", sortOrder: 0, sex: null, minAgeMonths: null });
  });

  it("creates a category with an explicit sortOrder", async () => {
    const created = await createCategory({ name: "Toro", sortOrder: 3 });

    expect(created).toEqual({ id: expect.any(String), name: "Toro", sortOrder: 3, sex: null, minAgeMonths: null });
  });

  it("creates an age-managed category scoped to a sex", async () => {
    const created = await createCategory({ name: "Novillo +3 años", sortOrder: 1, sex: "male", minAgeMonths: 36 });

    expect(created).toEqual({
      id: expect.any(String),
      name: "Novillo +3 años",
      sortOrder: 1,
      sex: "male",
      minAgeMonths: 36,
    });
  });

  it("rejects a duplicate name", async () => {
    await createCategory({ name: "Vaca" });
    await expect(createCategory({ name: "Vaca" })).rejects.toThrow();
  });
});

describe("updateCategory", () => {
  it("updates name and sortOrder", async () => {
    const created = await createCategory({ name: "Vaca", sortOrder: 1 });

    const updated = await updateCategory(created.id, { name: "Vaca de invernada", sortOrder: 5 });

    expect(updated).toEqual({
      id: created.id,
      name: "Vaca de invernada",
      sortOrder: 5,
      sex: null,
      minAgeMonths: null,
    });

    const [stored] = await testDb.select().from(category).where(eq(category.id, created.id));
    expect(stored.sortOrder).toBe(5);
  });

  it("updates sex and minAgeMonths", async () => {
    const created = await createCategory({ name: "Vaquillona 1 a 2 años", sortOrder: 1 });

    const updated = await updateCategory(created.id, {
      name: "Vaquillona 1 a 2 años",
      sortOrder: 1,
      sex: "female",
      minAgeMonths: 12,
    });

    expect(updated.sex).toBe("female");
    expect(updated.minAgeMonths).toBe(12);
  });

  it("rejects renaming into a name that already exists", async () => {
    await createCategory({ name: "Vaca" });
    const created = await createCategory({ name: "Toro" });

    await expect(updateCategory(created.id, { name: "Vaca", sortOrder: 0 })).rejects.toThrow();
  });
});
