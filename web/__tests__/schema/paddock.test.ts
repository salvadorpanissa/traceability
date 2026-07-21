import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, paddock } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("paddock table", () => {
  it("belongs to a farm and requires a name", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [created] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero 1" }).returning();

    expect(created.name).toBe("Potrero 1");
    expect(created.farmId).toBe(seededFarm.id);

    await expect(
      testDb.insert(paddock).values({ farmId: seededFarm.id, name: null as unknown as string })
    ).rejects.toThrow();
  });

  it("rejects two paddocks with the same name in the same farm", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero 1" });

    await expect(testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero 1" })).rejects.toThrow();
  });

  it("allows the same paddock name in two different farms", async () => {
    const [farmA] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmB] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();

    await testDb.insert(paddock).values({ farmId: farmA.id, name: "Potrero 1" });
    await expect(testDb.insert(paddock).values({ farmId: farmB.id, name: "Potrero 1" })).resolves.toBeDefined();
  });
});
