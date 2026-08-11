import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farmGroup, role, farm, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const {
  isAdmin,
  userFarmIds,
  requireFarmAccess,
  listSelectableFarms,
  userGroupIds,
  requireGroupAccess,
} = await import("@/lib/dal/farm-access");

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
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [farmNorteGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmNorte] = await testDb
      .insert(farm)
      .values({ groupId: farmNorteGroup.id, name: "Campo Norte" })
      .returning();
    const [farmSurGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "Campo Sur" })
      .returning();
    const [farmSur] = await testDb
      .insert(farm)
      .values({ groupId: farmSurGroup.id, name: "Campo Sur" })
      .returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({
        name: "Manager",
        email: "m@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();
    await testDb
      .insert(userFarm)
      .values({ userId: user.id, farmId: farmNorte.id });

    const ids = await userFarmIds(user.id);
    expect(ids).toEqual([farmNorte.id]);

    await expect(
      requireFarmAccess(user.id, "manager", farmNorte.id),
    ).resolves.toBeUndefined();
    await expect(
      requireFarmAccess(user.id, "manager", farmSur.id),
    ).rejects.toThrow("No tenés acceso a este campo");
  });

  it("expands access to every campo in the manager's assigned grupo", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [group] = await testDb
      .insert(farmGroup)
      .values({ name: "Grupo" })
      .returning();
    const [farmA] = await testDb
      .insert(farm)
      .values({ groupId: group.id, name: "Cuatro Cerros" })
      .returning();
    const [farmB] = await testDb
      .insert(farm)
      .values({ groupId: group.id, name: "San Antonio" })
      .returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({
        name: "Manager",
        email: "m2@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();
    // Assigned to only one campo of the grupo...
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmA.id });

    // ...but operates both, since they share a grupo.
    const ids = await userFarmIds(user.id);
    expect(ids.sort()).toEqual([farmA.id, farmB.id].sort());
    await expect(
      requireFarmAccess(user.id, "manager", farmB.id),
    ).resolves.toBeUndefined();
  });

  it("lets admins access any farm without a user_farm row", async () => {
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
      .returning();
    const [farmNorteGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmNorte] = await testDb
      .insert(farm)
      .values({ groupId: farmNorteGroup.id, name: "Campo Norte" })
      .returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({
        name: "Admin",
        email: "a@example.com",
        passwordHash: "x",
        roleId: adminRole.id,
      })
      .returning();

    await expect(
      requireFarmAccess(admin.id, "admin", farmNorte.id),
    ).resolves.toBeUndefined();
  });
});

describe("listSelectableFarms", () => {
  it("returns only the manager's assigned farms", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [farmNorteGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmNorte] = await testDb
      .insert(farm)
      .values({ groupId: farmNorteGroup.id, name: "Campo Norte" })
      .returning();
    const [group5] = await testDb
      .insert(farmGroup)
      .values({ name: "Campo Sur" })
      .returning();
    await testDb.insert(farm).values({ groupId: group5.id, name: "Campo Sur" });
    const [user] = await testDb
      .insert(userAccount)
      .values({
        name: "Manager",
        email: "m@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();
    await testDb
      .insert(userFarm)
      .values({ userId: user.id, farmId: farmNorte.id });

    const farms = await listSelectableFarms(user.id, "manager");
    expect(farms).toEqual([{ id: farmNorte.id, name: "Campo Norte", groupId: farmNorteGroup.id }]);
  });

  it("returns an empty list for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({
        name: "Sin campo",
        email: "s@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();

    expect(await listSelectableFarms(user.id, "manager")).toEqual([]);
  });

  it("returns all farms for an admin", async () => {
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
      .returning();
    const [group] = await testDb
      .insert(farmGroup)
      .values({ name: "Grupo" })
      .returning();
    await testDb
      .insert(farm)
      .values([
        { groupId: group.id, name: "Campo Norte" },
        { groupId: group.id, name: "Campo Sur" },
      ]);
    const [admin] = await testDb
      .insert(userAccount)
      .values({
        name: "Admin",
        email: "a@example.com",
        passwordHash: "x",
        roleId: adminRole.id,
      })
      .returning();

    expect(await listSelectableFarms(admin.id, "admin")).toHaveLength(2);
  });
});

describe("userGroupIds + requireGroupAccess", () => {
  it("lists the grupos reachable through the manager's assigned campos and blocks others", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [groupA] = await testDb.insert(farmGroup).values({ name: "Grupo A" }).returning();
    const [farmA] = await testDb.insert(farm).values({ groupId: groupA.id, name: "Campo A" }).returning();
    const [groupB] = await testDb.insert(farmGroup).values({ name: "Grupo B" }).returning();
    await testDb.insert(farm).values({ groupId: groupB.id, name: "Campo B" });
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m3@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmA.id });

    expect(await userGroupIds(user.id)).toEqual([groupA.id]);
    await expect(requireGroupAccess(user.id, "manager", groupA.id)).resolves.toBeUndefined();
    await expect(requireGroupAccess(user.id, "manager", groupB.id)).rejects.toThrow(
      "No tenés acceso a este grupo de campos"
    );
  });

  it("lets admins access any grupo without a user_farm row", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [group] = await testDb.insert(farmGroup).values({ name: "Grupo" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a2@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    await expect(requireGroupAccess(admin.id, "admin", group.id)).resolves.toBeUndefined();
  });
});
