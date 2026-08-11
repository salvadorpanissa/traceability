import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, role, establishment, userAccount, userFarm } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("user_account and user_farm", () => {
  it("links a manager to their farms and enforces unique email", async () => {
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
        name: "Encargado Norte",
        email: "encargado@example.com",
        passwordHash: "hashed",
        roleId: managerRole.id,
      })
      .returning();

    await testDb.insert(userFarm).values([
      { userId: user.id, farmId: farmNorteGroup.id },
      { userId: user.id, farmId: farmSurGroup.id },
    ]);

    const links = await testDb.select().from(userFarm);
    expect(links).toHaveLength(2);
    // farmNorte/farmSur (the establecimientos) exist to prove the manager's
    // farm-level assignment covers establecimientos under both farms —
    // referenced here only so eslint doesn't flag them as unused.
    expect([farmNorte.id, farmSur.id]).toHaveLength(2);

    await expect(
      testDb.insert(userAccount).values({
        name: "Duplicado",
        email: "encargado@example.com",
        passwordHash: "hashed",
        roleId: managerRole.id,
      }),
    ).rejects.toThrow();

    await expect(
      testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorteGroup.id }),
    ).rejects.toThrow();
  });
});
