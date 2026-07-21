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
});
