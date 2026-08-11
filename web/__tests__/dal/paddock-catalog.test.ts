import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, establishment, paddock } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const {
  listPaddocksByEstablishment,
  listPaddocksForEstablishments,
  createPaddock,
  updatePaddock,
} = await import("@/lib/dal/paddock-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listPaddocksByEstablishment", () => {
  it("lists only the paddocks belonging to the given establishment, ordered by name", async () => {
    const [farmAGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmA] = await testDb
      .insert(establishment)
      .values({ farmId: farmAGroup.id, name: "Campo Norte" })
      .returning();
    const [farmBGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: farmBGroup.id, name: "Campo Sur" })
      .returning();
    await testDb.insert(paddock).values([
      { establishmentId: farmA.id, name: "Potrero 2" },
      { establishmentId: farmA.id, name: "Potrero 1" },
      { establishmentId: farmB.id, name: "Otro potrero" },
    ]);

    const result = await listPaddocksByEstablishment(farmA.id);

    expect(result).toEqual([
      { id: expect.any(String), name: "Potrero 1", establishmentId: farmA.id },
      { id: expect.any(String), name: "Potrero 2", establishmentId: farmA.id },
    ]);
  });
});

describe("listPaddocksForEstablishments", () => {
  it("lists paddocks across multiple farms, ordered by name", async () => {
    const [farmAGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmA] = await testDb
      .insert(establishment)
      .values({ farmId: farmAGroup.id, name: "Campo Norte" })
      .returning();
    const [farmBGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: farmBGroup.id, name: "Campo Sur" })
      .returning();
    const [farmCGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Este" })
      .returning();
    const [farmC] = await testDb
      .insert(establishment)
      .values({ farmId: farmCGroup.id, name: "Campo Este" })
      .returning();
    await testDb.insert(paddock).values([
      { establishmentId: farmA.id, name: "Potrero 2" },
      { establishmentId: farmB.id, name: "Potrero 1" },
      { establishmentId: farmC.id, name: "Ajeno" },
    ]);

    const result = await listPaddocksForEstablishments([farmA.id, farmB.id]);

    expect(result).toEqual([
      { id: expect.any(String), name: "Potrero 1", establishmentId: farmB.id },
      { id: expect.any(String), name: "Potrero 2", establishmentId: farmA.id },
    ]);
  });

  it("returns an empty list when given no establishment ids", async () => {
    expect(await listPaddocksForEstablishments([])).toEqual([]);
  });
});

describe("createPaddock", () => {
  it("creates a paddock under the given establishment", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();

    const created = await createPaddock(seededFarm.id, "Potrero 3");

    expect(created).toEqual({
      id: expect.any(String),
      name: "Potrero 3",
      establishmentId: seededFarm.id,
    });
  });

  it("rejects a duplicate name within the same establishment", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    await createPaddock(seededFarm.id, "Potrero 1");
    await expect(createPaddock(seededFarm.id, "Potrero 1")).rejects.toThrow();
  });
});

describe("updatePaddock", () => {
  it("renames a paddock", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    const created = await createPaddock(seededFarm.id, "Potrero 1");

    const updated = await updatePaddock(created.id, "Potrero 1 (bajo)");

    expect(updated).toEqual({
      id: created.id,
      name: "Potrero 1 (bajo)",
      establishmentId: seededFarm.id,
    });
  });

  it("rejects renaming into a name that already exists within the same establishment", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    await createPaddock(seededFarm.id, "Potrero 1");
    const created = await createPaddock(seededFarm.id, "Potrero 2");

    await expect(updatePaddock(created.id, "Potrero 1")).rejects.toThrow();
  });
});
