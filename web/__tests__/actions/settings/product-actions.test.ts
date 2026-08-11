// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farmGroup, role, farm, userAccount, userFarm, product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createProductAction, updateProductAction } =
  await import("../../../app/(protected)/settings/products/actions");
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
    .insert(farmGroup)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(farm)
    .values({ groupId: seededFarmGroup.id, name: "Campo Norte" })
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
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });

  vi.mocked(auth).mockResolvedValue({
    user: { id: manager.id, role: "manager" },
  } as never);

  return { manager, seededFarm, seededFarmGroup };
}

describe("createProductAction", () => {
  it("creates a product and returns it", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();

    const result = await createProductAction({
      farmId: seededFarm.id,
      name: "Ivermectina 1%",
      defaultDose: "10",
      defaultDoseUnit: "ml",
      defaultRoute: "subcutánea",
      defaultWithdrawalDays: 21,
    });

    expect(result).toEqual({
      ok: true,
      entry: {
        id: expect.any(String),
        groupId: seededFarmGroup.id,
        name: "Ivermectina 1%",
        defaultDose: "10",
        defaultDoseUnit: "ml",
        defaultRoute: "subcutánea",
        defaultWithdrawalDays: 21,
      },
    });
    const [stored] = await testDb
      .select()
      .from(product)
      .where(eq(product.name, "Ivermectina 1%"));
    expect(stored).toBeDefined();
  });

  it("rejects a product for a campo the manager doesn't have access to", async () => {
    await seedManagerSession();
    const [otherGroup] = await testDb.insert(farmGroup).values({ name: "Otro grupo" }).returning();
    const [otherFarm] = await testDb.insert(farm).values({ groupId: otherGroup.id, name: "Campo Ajeno" }).returning();

    await expect(
      createProductAction({
        farmId: otherFarm.id,
        name: "Aftosa",
        defaultDose: null,
        defaultDoseUnit: null,
        defaultRoute: null,
        defaultWithdrawalDays: null,
      })
    ).rejects.toThrow("No tenés acceso a este campo");
  });

  it("rejects a duplicate name with a friendly error instead of throwing", async () => {
    const { seededFarm } = await seedManagerSession();
    await createProductAction({
      farmId: seededFarm.id,
      name: "Aftosa",
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    });

    const result = await createProductAction({
      farmId: seededFarm.id,
      name: "Aftosa",
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    });

    expect(result).toEqual({
      ok: false,
      error: "Ya existe un producto con ese nombre",
    });
  });
});

describe("updateProductAction", () => {
  it("rejects renaming into a name that already exists with a friendly error instead of throwing", async () => {
    const { seededFarm } = await seedManagerSession();
    await createProductAction({
      farmId: seededFarm.id,
      name: "Aftosa",
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    });
    const created = await createProductAction({
      farmId: seededFarm.id,
      name: "Ivermectina 1%",
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateProductAction({
      id: created.entry.id,
      name: "Aftosa",
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    });

    expect(result).toEqual({
      ok: false,
      error: "Ya existe un producto con ese nombre",
    });
  });

  it("rejects updating a product outside the caller's grupo", async () => {
    const { seededFarm } = await seedManagerSession();
    const created = await createProductAction({
      farmId: seededFarm.id,
      name: "Ivermectina 1%",
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    });
    if (!created.ok) throw new Error("setup failed");

    const [otherRole] = await testDb.select().from(role).where(eq(role.name, "manager"));
    const [otherGroup] = await testDb.insert(farmGroup).values({ name: "Otro grupo" }).returning();
    const [otherFarm] = await testDb.insert(farm).values({ groupId: otherGroup.id, name: "Campo Ajeno" }).returning();
    const [otherManager] = await testDb
      .insert(userAccount)
      .values({ name: "Otro manager", email: "otro@example.com", passwordHash: "hashed", roleId: otherRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: otherManager.id, farmId: otherFarm.id });
    vi.mocked(auth).mockResolvedValue({ user: { id: otherManager.id, role: "manager" } } as never);

    await expect(
      updateProductAction({
        id: created.entry.id,
        name: "Otro nombre",
        defaultDose: null,
        defaultDoseUnit: null,
        defaultRoute: null,
        defaultWithdrawalDays: null,
      })
    ).rejects.toThrow("No tenés acceso a este grupo de campos");
  });
});
