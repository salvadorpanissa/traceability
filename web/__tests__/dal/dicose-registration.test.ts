import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, owner, role, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listDicoseRegistrations, createDicoseRegistration } = await import("@/lib/dal/dicose-registration");

beforeEach(async () => {
  await resetTestDb();
});

describe("dicose-registration", () => {
  it("creates a registration and returns it with owner/farm names resolved", async () => {
    const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [createdFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();

    const created = await createDicoseRegistration({
      ownerId: createdOwner.id,
      farmId: createdFarm.id,
      dicoseCode: "151400442",
    });

    expect(created).toMatchObject({
      ownerId: createdOwner.id,
      ownerName: "AIP",
      farmId: createdFarm.id,
      farmName: "Campo San Antonio",
      dicoseCode: "151400442",
    });
  });

  it("lists every registration for an admin", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();
    const [ownerAip] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [ownerSasg] = await testDb.insert(owner).values({ name: "SASG" }).returning();
    const [createdFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();

    await createDicoseRegistration({ ownerId: ownerAip.id, farmId: createdFarm.id, dicoseCode: "151400442" });
    await createDicoseRegistration({ ownerId: ownerSasg.id, farmId: createdFarm.id, dicoseCode: "151422799" });

    const registrations = await listDicoseRegistrations(admin.id, "admin");
    expect(registrations).toHaveLength(2);
    expect(registrations.map((r) => r.dicoseCode).sort()).toEqual(["151400442", "151422799"]);
  });

  it("only lists registrations for farms the manager has access to", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    const [ownerAip] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [ownerSasg] = await testDb.insert(owner).values({ name: "SASG" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: farmNorte.id });

    await createDicoseRegistration({ ownerId: ownerAip.id, farmId: farmNorte.id, dicoseCode: "151400442" });
    await createDicoseRegistration({ ownerId: ownerSasg.id, farmId: farmSur.id, dicoseCode: "151422799" });

    const registrations = await listDicoseRegistrations(manager.id, "manager");
    expect(registrations).toHaveLength(1);
    expect(registrations[0].farmId).toBe(farmNorte.id);
  });

  it("returns an empty list for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Sin campo", email: "s@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();

    expect(await listDicoseRegistrations(manager.id, "manager")).toEqual([]);
  });
});
