import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, establishment, paddock } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("paddock table", () => {
  it("belongs to a establishment and requires a name", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [created] = await testDb
      .insert(paddock)
      .values({ establishmentId: seededFarm.id, name: "Potrero 1" })
      .returning();

    expect(created.name).toBe("Potrero 1");
    expect(created.establishmentId).toBe(seededFarm.id);

    await expect(
      testDb
        .insert(paddock)
        .values({ establishmentId: seededFarm.id, name: null as unknown as string }),
    ).rejects.toThrow();
  });

  it("rejects two paddocks with the same name in the same establishment", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    await testDb
      .insert(paddock)
      .values({ establishmentId: seededFarm.id, name: "Potrero 1" });

    await expect(
      testDb
        .insert(paddock)
        .values({ establishmentId: seededFarm.id, name: "Potrero 1" }),
    ).rejects.toThrow();
  });

  it("allows the same paddock name in two different farms", async () => {
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

    await testDb
      .insert(paddock)
      .values({ establishmentId: farmA.id, name: "Potrero 1" });
    await expect(
      testDb.insert(paddock).values({ establishmentId: farmB.id, name: "Potrero 1" }),
    ).resolves.toBeDefined();
  });
});
