// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, paddock } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createPaddockAction, updatePaddockAction } = await import(
  "../../../app/(protected)/settings/paddocks/actions"
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

describe("createPaddockAction", () => {
  it("creates a paddock and returns it", async () => {
    const { seededFarm } = await seedManagerSession();

    const result = await createPaddockAction({ farmId: seededFarm.id, name: "Potrero 1" });

    expect(result).toEqual({
      ok: true,
      entry: { id: expect.any(String), name: "Potrero 1", farmId: seededFarm.id },
    });
    const [stored] = await testDb.select().from(paddock).where(eq(paddock.name, "Potrero 1"));
    expect(stored).toBeDefined();
  });

  it("rejects a duplicate name within the same farm with a friendly error instead of throwing", async () => {
    const { seededFarm } = await seedManagerSession();
    await createPaddockAction({ farmId: seededFarm.id, name: "Potrero 1" });

    const result = await createPaddockAction({ farmId: seededFarm.id, name: "Potrero 1" });

    expect(result).toEqual({ ok: false, error: "Ya existe un potrero con ese nombre en ese campo" });
  });
});

describe("updatePaddockAction", () => {
  it("rejects renaming into a name that already exists within the same farm with a friendly error instead of throwing", async () => {
    const { seededFarm } = await seedManagerSession();
    await createPaddockAction({ farmId: seededFarm.id, name: "Potrero 1" });
    const created = await createPaddockAction({ farmId: seededFarm.id, name: "Potrero 2" });
    if (!created.ok) throw new Error("setup failed");

    const result = await updatePaddockAction({ id: created.entry.id, name: "Potrero 1" });

    expect(result).toEqual({ ok: false, error: "Ya existe un potrero con ese nombre en ese campo" });
  });
});
