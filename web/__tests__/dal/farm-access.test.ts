import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, role, establishment, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const {
  isAdmin,
  userEstablishmentIds,
  requireEstablishmentAccess,
  listSelectableEstablishments,
  userFarmIds,
  requireFarmAccess,
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

describe("userEstablishmentIds + requireEstablishmentAccess", () => {
  it("lists every establecimiento of the manager's assigned farm and blocks access to another farm's", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [farmNorteGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmNorte] = await testDb
      .insert(establishment)
      .values({ farmId: farmNorteGroup.id, name: "Campo Norte" })
      .returning();
    const [farmSurGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [farmSur] = await testDb
      .insert(establishment)
      .values({ farmId: farmSurGroup.id, name: "Campo Sur" })
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
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorteGroup.id });

    const ids = await userEstablishmentIds(user.id);
    expect(ids).toEqual([farmNorte.id]);

    await expect(
      requireEstablishmentAccess(user.id, "manager", farmNorte.id),
    ).resolves.toBeUndefined();
    await expect(
      requireEstablishmentAccess(user.id, "manager", farmSur.id),
    ).rejects.toThrow("No tenés acceso a este campo");
  });

  it("expands access to every campo in the manager's assigned farm", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [group] = await testDb
      .insert(farm)
      .values({ name: "Grupo" })
      .returning();
    const [farmA] = await testDb
      .insert(establishment)
      .values({ farmId: group.id, name: "Cuatro Cerros" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: group.id, name: "San Antonio" })
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
    // Assigned to the farm itself, not to either establecimiento...
    await testDb.insert(userFarm).values({ userId: user.id, farmId: group.id });

    // ...but operates both, since a farm assignment covers every
    // establecimiento it contains.
    const ids = await userEstablishmentIds(user.id);
    expect(ids.sort()).toEqual([farmA.id, farmB.id].sort());
    await expect(
      requireEstablishmentAccess(user.id, "manager", farmB.id),
    ).resolves.toBeUndefined();
  });

  it("lets admins access any establishment without a user_farm row", async () => {
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
      .returning();
    const [farmNorteGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmNorte] = await testDb
      .insert(establishment)
      .values({ farmId: farmNorteGroup.id, name: "Campo Norte" })
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
      requireEstablishmentAccess(admin.id, "admin", farmNorte.id),
    ).resolves.toBeUndefined();
  });
});

describe("listSelectableEstablishments", () => {
  it("returns only the establecimientos of the manager's assigned farm", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [farmNorteGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmNorte] = await testDb
      .insert(establishment)
      .values({ farmId: farmNorteGroup.id, name: "Campo Norte" })
      .returning();
    const [group5] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    await testDb.insert(establishment).values({ farmId: group5.id, name: "Campo Sur" });
    const [user] = await testDb
      .insert(userAccount)
      .values({
        name: "Manager",
        email: "m@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorteGroup.id });

    const farms = await listSelectableEstablishments(user.id, "manager");
    expect(farms).toEqual([{ id: farmNorte.id, name: "Campo Norte", farmId: farmNorteGroup.id }]);
  });

  it("returns an empty list for a manager with no assigned farm", async () => {
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

    expect(await listSelectableEstablishments(user.id, "manager")).toEqual([]);
  });

  it("returns all establecimientos for an admin", async () => {
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
      .returning();
    const [group] = await testDb
      .insert(farm)
      .values({ name: "Grupo" })
      .returning();
    await testDb
      .insert(establishment)
      .values([
        { farmId: group.id, name: "Campo Norte" },
        { farmId: group.id, name: "Campo Sur" },
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

    expect(await listSelectableEstablishments(admin.id, "admin")).toHaveLength(2);
  });
});

describe("userFarmIds + requireFarmAccess", () => {
  it("lists the farms the manager is directly assigned to and blocks others", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [groupA] = await testDb.insert(farm).values({ name: "Grupo A" }).returning();
    await testDb.insert(establishment).values({ farmId: groupA.id, name: "Campo A" });
    const [groupB] = await testDb.insert(farm).values({ name: "Grupo B" }).returning();
    await testDb.insert(establishment).values({ farmId: groupB.id, name: "Campo B" });
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m3@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: groupA.id });

    expect(await userFarmIds(user.id)).toEqual([groupA.id]);
    await expect(requireFarmAccess(user.id, "manager", groupA.id)).resolves.toBeUndefined();
    await expect(requireFarmAccess(user.id, "manager", groupB.id)).rejects.toThrow(
      "No tenés acceso a este grupo de campos"
    );
  });

  it("lets admins access any grupo without a user_farm row", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [group] = await testDb.insert(farm).values({ name: "Grupo" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a2@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    await expect(requireFarmAccess(admin.id, "admin", group.id)).resolves.toBeUndefined();
  });
});
