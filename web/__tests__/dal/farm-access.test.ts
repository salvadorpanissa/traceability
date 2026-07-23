import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { isAdmin, userFarmIds, requireFarmAccess, listSelectableFarms } = await import("@/lib/dal/farm-access");

beforeEach(async () => {
  await resetTestDb();
});

describe("isAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("manager")).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("userFarmIds + requireFarmAccess", () => {
  it("lists a manager's assigned farms and blocks access to others", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id });

    const ids = await userFarmIds(user.id);
    expect(ids).toEqual([farmNorte.id]);

    await expect(requireFarmAccess(user.id, "manager", farmNorte.id)).resolves.toBeUndefined();
    await expect(requireFarmAccess(user.id, "manager", farmSur.id)).rejects.toThrow(
      "No tenés acceso a este campo"
    );
  });

  it("lets admins access any farm without a user_farm row", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    await expect(requireFarmAccess(admin.id, "admin", farmNorte.id)).resolves.toBeUndefined();
  });
});

describe("listSelectableFarms", () => {
  it("returns only the manager's assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    await testDb.insert(farm).values({ name: "Campo Sur" });
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id });

    const farms = await listSelectableFarms(user.id, "manager");
    expect(farms).toEqual([{ id: farmNorte.id, name: "Campo Norte" }]);
  });

  it("returns an empty list for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Sin campo", email: "s@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();

    expect(await listSelectableFarms(user.id, "manager")).toEqual([]);
  });

  it("returns all farms for an admin", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    await testDb.insert(farm).values([{ name: "Campo Norte" }, { name: "Campo Sur" }]);
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    expect(await listSelectableFarms(admin.id, "admin")).toHaveLength(2);
  });
});
