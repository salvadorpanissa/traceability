import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farm, establishment, animalTagHistory, animal, role, userAccount, userFarm } from "@/db/schema";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveImportRows } = await import("@/lib/activities/bulk-import");

beforeEach(async () => {
  await resetTestDb();
});

// Admin sees every establecimiento unfiltered, so using an admin session
// here reproduces the pre-scoping behavior for tests that aren't about
// scoping itself.
async function seedAdmin(): Promise<{ id: string }> {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "x", roleId: adminRole.id })
    .returning();
  return admin;
}

function baseRow(overrides: Partial<MappedImportRow> = {}): MappedImportRow {
  return {
    tag: "858000048233520",
    secondaryTag: null,
    ownerName: "SASG",
    establishmentName: "San Antonio",
    paddockName: "Arerunguá",
    categoryName: "Vaca de cría",
    breed: "Hereford",
    sex: "Hembra",
    birthDate: "01/2021",
    eventDate: "2026-06-11",
    ...overrides,
  };
}

describe("resolveImportRows", () => {
  it("resolves a valid row against an existing establishment, normalizing sex and dates", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    const [resolved] = await resolveImportRows([baseRow()], admin.id, "admin");

    expect(resolved).toEqual({
      status: "valid",
      tag: "858000048233520",
      secondaryTag: null,
      ownerName: "SASG",
      establishmentId: seededFarm.id,
      paddockName: "Arerunguá",
      categoryName: "Vaca de cría",
      breed: "Hereford",
      sex: "female",
      birthDate: "2021-01-01",
      eventDate: "2026-06-11",
    });
  });

  it("errors a row with no tag", async () => {
    const admin = await seedAdmin();
    const [group2] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(establishment)
      .values({ farmId: group2.id, name: "San Antonio" });
    const [resolved] = await resolveImportRows([baseRow({ tag: "" })], admin.id, "admin");
    expect(resolved).toEqual({
      status: "error",
      tag: "",
      reason: "Falta la caravana",
    });
  });

  it("errors every row sharing a tag that's duplicated within the file", async () => {
    const admin = await seedAdmin();
    const [group3] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(establishment)
      .values({ farmId: group3.id, name: "San Antonio" });
    const rows = [baseRow(), baseRow()];

    const resolved = await resolveImportRows(rows, admin.id, "admin");

    expect(resolved).toEqual([
      {
        status: "error",
        tag: "858000048233520",
        reason: "Caravana duplicada en el archivo",
      },
      {
        status: "error",
        tag: "858000048233520",
        reason: "Caravana duplicada en el archivo",
      },
    ]);
  });

  it("resolves a row whose tag already exists in the system as an update, without requiring an Estancia", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();
    const [existingAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: existingAnimal.id, tag: "858000048233520" });

    const [resolved] = await resolveImportRows(
      [baseRow({ establishmentName: null })],
      admin.id,
      "admin"
    );

    expect(resolved).toEqual({
      status: "update",
      tag: "858000048233520",
      animalId: existingAnimal.id,
      secondaryTag: null,
      ownerName: "SASG",
      breed: "Hereford",
      sex: "female",
      birthDate: "2021-01-01",
    });
    void seededFarm;
  });

  it("errors a row whose Estancia doesn't match any existing establishment", async () => {
    const admin = await seedAdmin();
    const [resolved] = await resolveImportRows(
      [baseRow({ establishmentName: "Estancia Inexistente" })],
      admin.id,
      "admin"
    );
    expect(resolved).toEqual({
      status: "error",
      tag: "858000048233520",
      reason: "Estancia no reconocida",
    });
  });

  it("falls back to today's date when Fecha alta en sistema is missing or unparseable, instead of erroring the row", async () => {
    const admin = await seedAdmin();
    const [group5] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(establishment)
      .values({ farmId: group5.id, name: "San Antonio" });
    const today = new Date().toISOString().slice(0, 10);

    const [missing] = await resolveImportRows([baseRow({ eventDate: null })], admin.id, "admin");
    const [unparseable] = await resolveImportRows(
      [baseRow({ eventDate: "not-a-date" })],
      admin.id,
      "admin"
    );

    expect(missing).toMatchObject({ status: "valid", eventDate: today });
    expect(unparseable).toMatchObject({ status: "valid", eventDate: today });
  });

  it("leaves sex and birth date null when they don't match a known value, without erroring the row", async () => {
    const admin = await seedAdmin();
    const [group6] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(establishment)
      .values({ farmId: group6.id, name: "San Antonio" });
    const [resolved] = await resolveImportRows(
      [baseRow({ sex: "??", birthDate: "no-date" })],
      admin.id,
      "admin"
    );
    expect(resolved).toMatchObject({
      status: "valid",
      sex: null,
      birthDate: null,
    });
  });

  it("errors every row sharing a secondaryTag that's duplicated within the file", async () => {
    const admin = await seedAdmin();
    const [group7] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(establishment)
      .values({ farmId: group7.id, name: "San Antonio" });
    const rows = [
      baseRow({ tag: "TAG1", secondaryTag: "CHIP1" }),
      baseRow({ tag: "TAG2", secondaryTag: "CHIP1" }),
    ];

    const resolved = await resolveImportRows(rows, admin.id, "admin");

    expect(resolved).toEqual([
      {
        status: "error",
        tag: "TAG1",
        reason: "Chip secundario duplicado en el archivo",
      },
      {
        status: "error",
        tag: "TAG2",
        reason: "Chip secundario duplicado en el archivo",
      },
    ]);
  });

  it("errors a row whose secondaryTag already exists in animal_tag_history", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();
    const [existingAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({
      animalId: existingAnimal.id,
      tag: "OTHERTAG",
      secondaryTag: "CHIP1",
    });

    const [resolved] = await resolveImportRows(
      [baseRow({ tag: "TAG1", secondaryTag: "CHIP1" })],
      admin.id,
      "admin"
    );

    expect(resolved).toEqual({
      status: "error",
      tag: "TAG1",
      reason: "Chip secundario ya asignado a otro animal",
    });
    void seededFarm;
  });

  describe("scoping (manager vs. admin)", () => {
    it("resolves a manager's own establecimiento by name", async () => {
      const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
      const [ownGroup] = await testDb.insert(farm).values({ name: "Grupo Propio" }).returning();
      const [ownEstablishment] = await testDb
        .insert(establishment)
        .values({ farmId: ownGroup.id, name: "San Antonio" })
        .returning();
      const [manager] = await testDb
        .insert(userAccount)
        .values({ name: "Manager", email: "manager@example.com", passwordHash: "x", roleId: managerRole.id })
        .returning();
      await testDb.insert(userFarm).values({ userId: manager.id, farmId: ownGroup.id });

      const [resolved] = await resolveImportRows([baseRow()], manager.id, "manager");

      expect(resolved).toMatchObject({ status: "valid", establishmentId: ownEstablishment.id });
    });

    it("refuses to resolve another cliente's establecimiento by name, even though it exists", async () => {
      const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
      const [ownGroup] = await testDb.insert(farm).values({ name: "Grupo Propio" }).returning();
      const [manager] = await testDb
        .insert(userAccount)
        .values({ name: "Manager", email: "manager2@example.com", passwordHash: "x", roleId: managerRole.id })
        .returning();
      await testDb.insert(userFarm).values({ userId: manager.id, farmId: ownGroup.id });

      // Another cliente's campo happens to have an establecimiento with the
      // same name the manager is importing.
      const [otherGroup] = await testDb.insert(farm).values({ name: "Otro Cliente" }).returning();
      await testDb.insert(establishment).values({ farmId: otherGroup.id, name: "San Antonio" });

      const [resolved] = await resolveImportRows([baseRow()], manager.id, "manager");

      expect(resolved).toEqual({
        status: "error",
        tag: "858000048233520",
        reason: "Estancia no reconocida",
      });
    });
  });
});
