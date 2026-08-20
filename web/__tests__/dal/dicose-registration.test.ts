import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  farm,
  dicose,
  establishment,
  owner,
  role,
  userAccount,
  userFarm,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const {
  listDicoseRegistrations,
  createDicoseRegistration,
  findEstablishmentByDicoseCode,
} = await import("@/lib/dal/dicose");

beforeEach(async () => {
  await resetTestDb();
});

describe("dicose-registration", () => {
  it("creates a registration and returns it with owner/establishment names resolved", async () => {
    const [createdFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo San Antonio" })
      .returning();
    const [createdOwner] = await testDb
      .insert(owner)
      .values({ name: "AIP", farmId: createdFarmGroup.id })
      .returning();
    const [createdFarm] = await testDb
      .insert(establishment)
      .values({ farmId: createdFarmGroup.id, name: "Campo San Antonio" })
      .returning();

    const created = await createDicoseRegistration({
      ownerId: createdOwner.id,
      establishmentId: createdFarm.id,
      dicoseCode: "151400442",
    });

    expect(created).toMatchObject({
      ownerId: createdOwner.id,
      ownerName: "AIP",
      establishmentId: createdFarm.id,
      establishmentName: "Campo San Antonio",
      dicoseCode: "151400442",
    });
  });

  it("lists every registration for an admin", async () => {
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
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
    const [createdFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo San Antonio" })
      .returning();
    const [ownerAip] = await testDb
      .insert(owner)
      .values({ name: "AIP", farmId: createdFarmGroup.id })
      .returning();
    const [ownerSasg] = await testDb
      .insert(owner)
      .values({ name: "SASG", farmId: createdFarmGroup.id })
      .returning();
    const [createdFarm] = await testDb
      .insert(establishment)
      .values({ farmId: createdFarmGroup.id, name: "Campo San Antonio" })
      .returning();

    await createDicoseRegistration({
      ownerId: ownerAip.id,
      establishmentId: createdFarm.id,
      dicoseCode: "151400442",
    });
    await createDicoseRegistration({
      ownerId: ownerSasg.id,
      establishmentId: createdFarm.id,
      dicoseCode: "151422799",
    });

    const registrations = await listDicoseRegistrations(admin.id, "admin");
    expect(registrations).toHaveLength(2);
    expect(registrations.map((r) => r.dicoseCode).sort()).toEqual([
      "151400442",
      "151422799",
    ]);
  });

  it("only lists registrations for farms the manager has access to", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({
        name: "Manager",
        email: "m@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
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
    const [ownerAip] = await testDb
      .insert(owner)
      .values({ name: "AIP", farmId: farmNorteGroup.id })
      .returning();
    const [ownerSasg] = await testDb
      .insert(owner)
      .values({ name: "SASG", farmId: farmSurGroup.id })
      .returning();
    await testDb
      .insert(userFarm)
      .values({ userId: manager.id, farmId: farmNorteGroup.id });

    await createDicoseRegistration({
      ownerId: ownerAip.id,
      establishmentId: farmNorte.id,
      dicoseCode: "151400442",
    });
    await createDicoseRegistration({
      ownerId: ownerSasg.id,
      establishmentId: farmSur.id,
      dicoseCode: "151422799",
    });

    const registrations = await listDicoseRegistrations(manager.id, "manager");
    expect(registrations).toHaveLength(1);
    expect(registrations[0].establishmentId).toBe(farmNorte.id);
  });

  it("returns an empty list for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({
        name: "Sin campo",
        email: "s@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();

    expect(await listDicoseRegistrations(manager.id, "manager")).toEqual([]);
  });
});

describe("findEstablishmentByDicoseCode", () => {
  it("resolves a registered DICOSE code to its establishment for a user with access", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({
        name: "Manager",
        email: "m2@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [seededOwner] = await testDb
      .insert(owner)
      .values({ name: "AIP", farmId: seededFarmGroup.id })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });
    await testDb
      .insert(dicose)
      .values({
        ownerId: seededOwner.id,
        establishmentId: seededFarm.id,
        dicoseCode: "151518192",
      });

    const result = await findEstablishmentByDicoseCode("151518192", manager.id, "manager");

    expect(result).toEqual({
      establishmentId: seededFarm.id,
      establishmentName: "Cuatro Cerros",
    });
  });

  it("returns null for a DICOSE code registered on a farm the user has no access to", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({
        name: "Sin campo",
        email: "m3@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [seededOwner] = await testDb
      .insert(owner)
      .values({ name: "AIP", farmId: seededFarmGroup.id })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    await testDb
      .insert(dicose)
      .values({
        ownerId: seededOwner.id,
        establishmentId: seededFarm.id,
        dicoseCode: "151518192",
      });

    expect(await findEstablishmentByDicoseCode("151518192", manager.id, "manager")).toBeNull();
  });

  it("resolves any registered DICOSE code for an admin", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({
        name: "Admin",
        email: "a2@example.com",
        passwordHash: "x",
        roleId: adminRole.id,
      })
      .returning();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [seededOwner] = await testDb
      .insert(owner)
      .values({ name: "AIP", farmId: seededFarmGroup.id })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    await testDb
      .insert(dicose)
      .values({
        ownerId: seededOwner.id,
        establishmentId: seededFarm.id,
        dicoseCode: "151518192",
      });

    const result = await findEstablishmentByDicoseCode("151518192", admin.id, "admin");

    expect(result).toEqual({
      establishmentId: seededFarm.id,
      establishmentName: "Cuatro Cerros",
    });
  });

  it("returns null for a DICOSE code with no registration", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({
        name: "Manager",
        email: "m4@example.com",
        passwordHash: "x",
        roleId: managerRole.id,
      })
      .returning();
    expect(await findEstablishmentByDicoseCode("000000000", manager.id, "manager")).toBeNull();
  });
});
