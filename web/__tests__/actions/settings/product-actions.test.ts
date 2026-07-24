// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createProductAction, updateProductAction } = await import(
  "../../../app/(protected)/settings/products/actions"
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

describe("createProductAction", () => {
  it("creates a product and returns it", async () => {
    await seedManagerSession();

    const result = await createProductAction({ name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 });

    expect(result).toEqual({
      ok: true,
      entry: { id: expect.any(String), name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
    });
    const [stored] = await testDb.select().from(product).where(eq(product.name, "Ivermectina 1%"));
    expect(stored).toBeDefined();
  });

  it("rejects a duplicate name with a friendly error instead of throwing", async () => {
    await seedManagerSession();
    await createProductAction({ name: "Aftosa", defaultDoseUnit: null, defaultWithdrawalDays: null });

    const result = await createProductAction({ name: "Aftosa", defaultDoseUnit: null, defaultWithdrawalDays: null });

    expect(result).toEqual({ ok: false, error: "Ya existe un producto con ese nombre" });
  });
});

describe("updateProductAction", () => {
  it("rejects renaming into a name that already exists with a friendly error instead of throwing", async () => {
    await seedManagerSession();
    await createProductAction({ name: "Aftosa", defaultDoseUnit: null, defaultWithdrawalDays: null });
    const created = await createProductAction({ name: "Ivermectina 1%", defaultDoseUnit: null, defaultWithdrawalDays: null });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateProductAction({
      id: created.entry.id,
      name: "Aftosa",
      defaultDoseUnit: null,
      defaultWithdrawalDays: null,
    });

    expect(result).toEqual({ ok: false, error: "Ya existe un producto con ese nombre" });
  });
});
