import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, establishment, role, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listFarmsWithCounts, listManagerCandidates, createFarm } = await import("@/lib/dal/admin-overview");

beforeEach(async () => {
  await resetTestDb();
});

describe("listFarmsWithCounts", () => {
  it("counts establecimientos and distinct managers per campo, without listing who they are", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmA] = await testDb.insert(farm).values({ name: "Campo A" }).returning();
    await testDb
      .insert(establishment)
      .values([
        { farmId: farmA.id, name: "Establecimiento 1" },
        { farmId: farmA.id, name: "Establecimiento 2" },
      ]);
    const [manager1] = await testDb
      .insert(userAccount)
      .values({ name: "Manager 1", email: "m1@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    const [manager2] = await testDb
      .insert(userAccount)
      .values({ name: "Manager 2", email: "m2@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values([
      { userId: manager1.id, farmId: farmA.id },
      { userId: manager2.id, farmId: farmA.id },
    ]);

    const [farmB] = await testDb.insert(farm).values({ name: "Campo B" }).returning();

    const overview = await listFarmsWithCounts();

    expect(overview).toEqual([
      { id: farmA.id, name: "Campo A", establishmentCount: 2, managerCount: 2 },
      { id: farmB.id, name: "Campo B", establishmentCount: 0, managerCount: 0 },
    ]);
  });
});

describe("listManagerCandidates", () => {
  it("returns only users with the manager role", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "x", roleId: adminRole.id });

    const candidates = await listManagerCandidates();

    expect(candidates).toEqual([{ id: manager.id, name: manager.name, email: manager.email }]);
  });
});

describe("createFarm", () => {
  it("creates the farm and links the given manager", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();

    const entry = await createFarm({ name: "Campo Nuevo", managerId: manager.id });

    expect(entry).toMatchObject({ name: "Campo Nuevo", establishmentCount: 0, managerCount: 1 });

    const overview = await listFarmsWithCounts();
    expect(overview).toEqual([{ id: entry.id, name: "Campo Nuevo", establishmentCount: 0, managerCount: 1 }]);
  });

  it("creates the farm without a manager link when none is given", async () => {
    const entry = await createFarm({ name: "Campo Sin Manager", managerId: null });

    expect(entry).toMatchObject({ name: "Campo Sin Manager", managerCount: 0 });
  });
});
