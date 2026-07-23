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
      { id: expect.any(String), name: "Vaca", sortOrder: 1 },
      { id: expect.any(String), name: "Toro", sortOrder: 2 },
    ]);
  });
});

describe("createCategory", () => {
  it("creates a category with sortOrder defaulting to 0 when omitted", async () => {
    const created = await createCategory("Vaca");

    expect(created).toEqual({ id: expect.any(String), name: "Vaca", sortOrder: 0 });
  });

  it("creates a category with an explicit sortOrder", async () => {
    const created = await createCategory("Toro", 3);

    expect(created).toEqual({ id: expect.any(String), name: "Toro", sortOrder: 3 });
  });

  it("rejects a duplicate name", async () => {
    await createCategory("Vaca");
    await expect(createCategory("Vaca")).rejects.toThrow();
  });
});

describe("updateCategory", () => {
  it("updates name and sortOrder", async () => {
    const created = await createCategory("Vaca", 1);

    const updated = await updateCategory(created.id, { name: "Vaca de invernada", sortOrder: 5 });

    expect(updated).toEqual({ id: created.id, name: "Vaca de invernada", sortOrder: 5 });

    const [stored] = await testDb.select().from(category).where(eq(category.id, created.id));
    expect(stored.sortOrder).toBe(5);
  });

  it("rejects renaming into a name that already exists", async () => {
    await createCategory("Vaca");
    const created = await createCategory("Toro");

    await expect(updateCategory(created.id, { name: "Vaca", sortOrder: 0 })).rejects.toThrow();
  });
});
