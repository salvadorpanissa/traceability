// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, category } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createCategoryAction, updateCategoryAction } = await import(
  "../../../app/(protected)/settings/categories/actions"
);
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerSession() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();

  vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

  return { manager, seededFarm };
}

describe("createCategoryAction", () => {
  it("creates a category and returns it", async () => {
    await seedManagerSession();

    const result = await createCategoryAction({ name: "Vaca", sortOrder: 1 });

    expect(result).toEqual({
      ok: true,
      entry: { id: expect.any(String), name: "Vaca", sortOrder: 1 },
    });
    const [stored] = await testDb.select().from(category).where(eq(category.name, "Vaca"));
    expect(stored).toBeDefined();
  });

  it("rejects a duplicate name with a friendly error instead of throwing", async () => {
    await seedManagerSession();
    await createCategoryAction({ name: "Vaca", sortOrder: 1 });

    const result = await createCategoryAction({ name: "Vaca", sortOrder: 2 });

    expect(result).toEqual({ ok: false, error: "Ya existe una categoría con ese nombre" });
  });
});

describe("updateCategoryAction", () => {
  it("rejects renaming into a name that already exists with a friendly error instead of throwing", async () => {
    await seedManagerSession();
    await createCategoryAction({ name: "Vaca", sortOrder: 1 });
    const created = await createCategoryAction({ name: "Toro", sortOrder: 2 });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateCategoryAction({ id: created.entry.id, name: "Vaca", sortOrder: 2 });

    expect(result).toEqual({ ok: false, error: "Ya existe una categoría con ese nombre" });
  });
});
