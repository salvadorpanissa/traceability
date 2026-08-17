import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, owner } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listOwnersByFarms, createOwner } = await import("@/lib/dal/owner-catalog");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarm(name: string) {
  const [seededFarm] = await testDb.insert(farm).values({ name }).returning();
  return seededFarm;
}

describe("listOwnersByFarms", () => {
  it("lists every owner for the given farms ordered by name", async () => {
    const farmA = await seedFarm("Campo Norte");
    await testDb
      .insert(owner)
      .values([
        { name: "Pérez", farmId: farmA.id },
        { name: "Gómez", farmId: farmA.id },
      ]);

    const owners = await listOwnersByFarms([farmA.id]);

    expect(owners).toEqual([
      { id: expect.any(String), name: "Gómez", farmId: farmA.id },
      { id: expect.any(String), name: "Pérez", farmId: farmA.id },
    ]);
  });

  it("only returns owners belonging to the requested farms", async () => {
    const farmA = await seedFarm("Campo Norte");
    const farmB = await seedFarm("Campo Sur");
    await testDb.insert(owner).values([
      { name: "Pérez", farmId: farmA.id },
      { name: "Gómez", farmId: farmB.id },
    ]);

    const owners = await listOwnersByFarms([farmA.id]);

    expect(owners).toEqual([{ id: expect.any(String), name: "Pérez", farmId: farmA.id }]);
  });
});

describe("createOwner", () => {
  it("creates an owner with the given name scoped to the farm", async () => {
    const farmA = await seedFarm("Campo Norte");

    const created = await createOwner(farmA.id, "Pérez");

    expect(created).toEqual({ id: expect.any(String), name: "Pérez", farmId: farmA.id });

    const [stored] = await testDb.select().from(owner).where(eq(owner.id, created.id));
    expect(stored.name).toBe("Pérez");
    expect(stored.farmId).toBe(farmA.id);
  });

  it("rejects a duplicate name within the same farm", async () => {
    const farmA = await seedFarm("Campo Norte");
    await createOwner(farmA.id, "Pérez");

    await expect(createOwner(farmA.id, "Pérez")).rejects.toThrow();
  });

  it("allows the same name in two different farms", async () => {
    const farmA = await seedFarm("Campo Norte");
    const farmB = await seedFarm("Campo Sur");
    await createOwner(farmA.id, "Pérez");

    const createdInB = await createOwner(farmB.id, "Pérez");

    expect(createdInB.name).toBe("Pérez");
    expect(createdInB.farmId).toBe(farmB.id);
  });
});
