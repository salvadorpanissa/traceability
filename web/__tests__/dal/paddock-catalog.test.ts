import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, paddock } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listPaddocksByFarm, createPaddock } = await import("@/lib/dal/paddock-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listPaddocksByFarm", () => {
  it("lists only the paddocks belonging to the given farm, ordered by name", async () => {
    const [farmA] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmB] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    await testDb.insert(paddock).values([
      { farmId: farmA.id, name: "Potrero 2" },
      { farmId: farmA.id, name: "Potrero 1" },
      { farmId: farmB.id, name: "Otro potrero" },
    ]);

    const result = await listPaddocksByFarm(farmA.id);

    expect(result).toEqual([
      { id: expect.any(String), name: "Potrero 1", farmId: farmA.id },
      { id: expect.any(String), name: "Potrero 2", farmId: farmA.id },
    ]);
  });
});

describe("createPaddock", () => {
  it("creates a paddock under the given farm", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();

    const created = await createPaddock(seededFarm.id, "Potrero 3");

    expect(created).toEqual({ id: expect.any(String), name: "Potrero 3", farmId: seededFarm.id });
  });

  it("rejects a duplicate name within the same farm", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    await createPaddock(seededFarm.id, "Potrero 1");
    await expect(createPaddock(seededFarm.id, "Potrero 1")).rejects.toThrow();
  });
});
