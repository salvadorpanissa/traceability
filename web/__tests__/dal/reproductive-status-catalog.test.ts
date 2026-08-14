import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, reproductiveStatus } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const {
  listReproductiveStatusesByFarm,
  listAllReproductiveStatusesForFarms,
  getReproductiveStatusFarmId,
  createReproductiveStatus,
  updateReproductiveStatusName,
  setReproductiveStatusActive,
} = await import("@/lib/dal/reproductive-status-catalog");

beforeEach(async () => {
  await resetTestDb();
});

async function seedGroup(name = "Grupo") {
  const [group] = await testDb.insert(farm).values({ name }).returning();
  return group;
}

describe("listReproductiveStatusesByFarm", () => {
  it("lists every active status in the grupo ordered by name", async () => {
    const group = await seedGroup();
    await testDb.insert(reproductiveStatus).values([
      { farmId: group.id, name: "Vacía" },
      { farmId: group.id, name: "Preñada" },
    ]);

    const statuses = await listReproductiveStatusesByFarm(group.id);

    expect(statuses).toEqual([
      { id: expect.any(String), farmId: group.id, name: "Preñada", active: true },
      { id: expect.any(String), farmId: group.id, name: "Vacía", active: true },
    ]);
  });

  it("excludes archived statuses", async () => {
    const group = await seedGroup();
    await testDb.insert(reproductiveStatus).values([
      { farmId: group.id, name: "Preñada" },
      { farmId: group.id, name: "Vacía", active: false },
    ]);

    expect((await listReproductiveStatusesByFarm(group.id)).map((s) => s.name)).toEqual(["Preñada"]);
  });

  it("does not include a status from a different grupo", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await testDb.insert(reproductiveStatus).values({ farmId: groupB.id, name: "Preñada" });

    expect(await listReproductiveStatusesByFarm(groupA.id)).toEqual([]);
  });
});

describe("listAllReproductiveStatusesForFarms", () => {
  it("lists statuses across every grupo given, including archived", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await testDb.insert(reproductiveStatus).values([
      { farmId: groupA.id, name: "Preñada" },
      { farmId: groupB.id, name: "Vacía", active: false },
    ]);

    const statuses = await listAllReproductiveStatusesForFarms([groupA.id, groupB.id]);

    expect(statuses.map((s) => ({ name: s.name, active: s.active }))).toEqual([
      { name: "Preñada", active: true },
      { name: "Vacía", active: false },
    ]);
  });
});

describe("getReproductiveStatusFarmId", () => {
  it("returns the farm a status belongs to", async () => {
    const group = await seedGroup();
    const created = await createReproductiveStatus(group.id, "Preñada");
    expect(await getReproductiveStatusFarmId(created.id)).toBe(group.id);
  });

  it("returns null for an unknown id", async () => {
    expect(await getReproductiveStatusFarmId("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("createReproductiveStatus", () => {
  it("creates a status, active by default", async () => {
    const group = await seedGroup();
    const created = await createReproductiveStatus(group.id, "Preñada");
    expect(created).toEqual({ id: expect.any(String), farmId: group.id, name: "Preñada", active: true });
  });

  it("rejects a duplicate name within the same grupo", async () => {
    const group = await seedGroup();
    await createReproductiveStatus(group.id, "Preñada");
    await expect(createReproductiveStatus(group.id, "Preñada")).rejects.toThrow();
  });
});

describe("updateReproductiveStatusName", () => {
  it("renames a status", async () => {
    const group = await seedGroup();
    const created = await createReproductiveStatus(group.id, "Preñada");

    const updated = await updateReproductiveStatusName(created.id, "Preñada confirmada");

    expect(updated.name).toBe("Preñada confirmada");
    const [stored] = await testDb.select().from(reproductiveStatus).where(eq(reproductiveStatus.id, created.id));
    expect(stored.name).toBe("Preñada confirmada");
  });

  it("rejects renaming into a name that already exists in the same grupo", async () => {
    const group = await seedGroup();
    await createReproductiveStatus(group.id, "Preñada");
    const created = await createReproductiveStatus(group.id, "Vacía");

    await expect(updateReproductiveStatusName(created.id, "Preñada")).rejects.toThrow();
  });
});

describe("setReproductiveStatusActive", () => {
  it("archives a status, hiding it from listReproductiveStatusesByFarm", async () => {
    const group = await seedGroup();
    const created = await createReproductiveStatus(group.id, "Preñada");

    await setReproductiveStatusActive(created.id, false);

    expect(await listReproductiveStatusesByFarm(group.id)).toEqual([]);
    const all = await listAllReproductiveStatusesForFarms([group.id]);
    expect(all).toEqual([{ ...created, active: false }]);
  });

  it("reactivates an archived status", async () => {
    const group = await seedGroup();
    const created = await createReproductiveStatus(group.id, "Preñada");
    await setReproductiveStatusActive(created.id, false);

    await setReproductiveStatusActive(created.id, true);

    expect((await listReproductiveStatusesByFarm(group.id)).map((s) => s.id)).toContain(created.id);
  });
});
