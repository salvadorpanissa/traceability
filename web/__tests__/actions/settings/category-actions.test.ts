// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farm, role, userAccount, userFarm, category } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createCategoryAction, updateCategoryAction } =
  await import("../../../app/(protected)/settings/categories/actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerSession() {
  const [managerRole] = await testDb
    .insert(role)
    .values({ name: "manager" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: "Campo Norte" })
    .returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({
      name: "Manager",
      email: "manager@example.com",
      passwordHash: "hashed",
      roleId: managerRole.id,
    })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });

  vi.mocked(auth).mockResolvedValue({
    user: { id: manager.id, role: "manager" },
  } as never);

  return { manager, seededFarmGroup };
}

describe("createCategoryAction", () => {
  it("creates a category and returns it", async () => {
    const { seededFarmGroup } = await seedManagerSession();

    const result = await createCategoryAction({ farmId: seededFarmGroup.id, name: "Vaca" });

    expect(result).toEqual({
      ok: true,
      entry: {
        id: expect.any(String),
        farmId: seededFarmGroup.id,
        name: "Vaca",
        sex: null,
        minAgeMonths: null,
        active: true,
      },
    });
    const [stored] = await testDb
      .select()
      .from(category)
      .where(eq(category.name, "Vaca"));
    expect(stored).toBeDefined();
  });

  it("rejects a category for a campo the manager doesn't have access to", async () => {
    await seedManagerSession();
    const [otherGroup] = await testDb.insert(farm).values({ name: "Otro grupo" }).returning();

    await expect(createCategoryAction({ farmId: otherGroup.id, name: "Vaca" })).rejects.toThrow(
      "No tenés acceso a este grupo de campos"
    );
  });

  it("rejects a duplicate name with a friendly error instead of throwing", async () => {
    const { seededFarmGroup } = await seedManagerSession();
    await createCategoryAction({ farmId: seededFarmGroup.id, name: "Vaca" });

    const result = await createCategoryAction({ farmId: seededFarmGroup.id, name: "Vaca" });

    expect(result).toEqual({
      ok: false,
      error: "Ya existe una categoría con ese nombre",
    });
  });
});

describe("updateCategoryAction", () => {
  it("rejects renaming into a name that already exists with a friendly error instead of throwing", async () => {
    const { seededFarmGroup } = await seedManagerSession();
    await createCategoryAction({ farmId: seededFarmGroup.id, name: "Vaca" });
    const created = await createCategoryAction({ farmId: seededFarmGroup.id, name: "Toro" });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateCategoryAction({
      id: created.entry.id,
      name: "Vaca",
    });

    expect(result).toEqual({
      ok: false,
      error: "Ya existe una categoría con ese nombre",
    });
  });

  it("rejects updating a category outside the caller's grupo", async () => {
    const { seededFarmGroup } = await seedManagerSession();
    const created = await createCategoryAction({ farmId: seededFarmGroup.id, name: "Vaca" });
    if (!created.ok) throw new Error("setup failed");

    const [otherRole] = await testDb.select().from(role).where(eq(role.name, "manager"));
    const [otherGroup] = await testDb.insert(farm).values({ name: "Otro grupo" }).returning();
    const [otherManager] = await testDb
      .insert(userAccount)
      .values({ name: "Otro manager", email: "otro@example.com", passwordHash: "hashed", roleId: otherRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: otherManager.id, farmId: otherGroup.id });
    vi.mocked(auth).mockResolvedValue({ user: { id: otherManager.id, role: "manager" } } as never);

    await expect(updateCategoryAction({ id: created.entry.id, name: "Otro nombre" })).rejects.toThrow(
      "No tenés acceso a este grupo de campos"
    );
  });
});
