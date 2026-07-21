import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveActiveFarm } = await import("@/lib/dal/active-farm");

beforeEach(async () => {
  await resetTestDb();
});

describe("resolveActiveFarm", () => {
  it("returns null when the farm doesn't exist", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();

    const result = await resolveActiveFarm(user.id, "manager", "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("lets an admin access any farm without a user_farm row", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    const result = await resolveActiveFarm(admin.id, "admin", farmNorte.id);
    expect(result).toEqual({ id: farmNorte.id, name: "Campo Norte" });
  });

  it("lets a manager access a farm they are assigned to via user_farm", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id });

    const result = await resolveActiveFarm(user.id, "manager", farmNorte.id);
    expect(result).toEqual({ id: farmNorte.id, name: "Campo Norte" });
  });

  it("rejects a manager for a farm they don't have a user_farm row for", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id });

    const result = await resolveActiveFarm(user.id, "manager", farmSur.id);
    expect(result).toBeNull();
  });
});
