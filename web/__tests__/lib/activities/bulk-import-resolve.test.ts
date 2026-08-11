import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farmGroup, farm, animalTagHistory, animal } from "@/db/schema";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveImportRows } = await import("@/lib/activities/bulk-import");

beforeEach(async () => {
  await resetTestDb();
});

function baseRow(overrides: Partial<MappedImportRow> = {}): MappedImportRow {
  return {
    tag: "858000048233520",
    secondaryTag: null,
    ownerName: "SASG",
    farmName: "San Antonio",
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
  it("resolves a valid row against an existing farm, normalizing sex and dates", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(farm)
      .values({ groupId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    const [resolved] = await resolveImportRows([baseRow()]);

    expect(resolved).toEqual({
      status: "valid",
      tag: "858000048233520",
      secondaryTag: null,
      ownerName: "SASG",
      farmId: seededFarm.id,
      paddockName: "Arerunguá",
      categoryName: "Vaca de cría",
      breed: "Hereford",
      sex: "female",
      birthDate: "2021-01-01",
      eventDate: "2026-06-11",
    });
  });

  it("errors a row with no tag", async () => {
    const [group2] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(farm)
      .values({ groupId: group2.id, name: "San Antonio" });
    const [resolved] = await resolveImportRows([baseRow({ tag: "" })]);
    expect(resolved).toEqual({
      status: "error",
      tag: "",
      reason: "Falta la caravana",
    });
  });

  it("errors every row sharing a tag that's duplicated within the file", async () => {
    const [group3] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(farm)
      .values({ groupId: group3.id, name: "San Antonio" });
    const rows = [baseRow(), baseRow()];

    const resolved = await resolveImportRows(rows);

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

  it("errors a row whose tag already exists in the system", async () => {
    const [seededFarmGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(farm)
      .values({ groupId: seededFarmGroup.id, name: "San Antonio" })
      .returning();
    const [existingAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: existingAnimal.id, tag: "858000048233520" });

    const [resolved] = await resolveImportRows([baseRow()]);

    expect(resolved).toEqual({
      status: "error",
      tag: "858000048233520",
      reason: "La caravana ya existe en el sistema",
    });
    void seededFarm;
  });

  it("errors a row whose Estancia doesn't match any existing farm", async () => {
    const [resolved] = await resolveImportRows([
      baseRow({ farmName: "Estancia Inexistente" }),
    ]);
    expect(resolved).toEqual({
      status: "error",
      tag: "858000048233520",
      reason: "Estancia no reconocida",
    });
  });

  it("falls back to today's date when Fecha alta en sistema is missing or unparseable, instead of erroring the row", async () => {
    const [group5] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(farm)
      .values({ groupId: group5.id, name: "San Antonio" });
    const today = new Date().toISOString().slice(0, 10);

    const [missing] = await resolveImportRows([baseRow({ eventDate: null })]);
    const [unparseable] = await resolveImportRows([
      baseRow({ eventDate: "not-a-date" }),
    ]);

    expect(missing).toMatchObject({ status: "valid", eventDate: today });
    expect(unparseable).toMatchObject({ status: "valid", eventDate: today });
  });

  it("leaves sex and birth date null when they don't match a known value, without erroring the row", async () => {
    const [group6] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(farm)
      .values({ groupId: group6.id, name: "San Antonio" });
    const [resolved] = await resolveImportRows([
      baseRow({ sex: "??", birthDate: "no-date" }),
    ]);
    expect(resolved).toMatchObject({
      status: "valid",
      sex: null,
      birthDate: null,
    });
  });

  it("errors every row sharing a secondaryTag that's duplicated within the file", async () => {
    const [group7] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(farm)
      .values({ groupId: group7.id, name: "San Antonio" });
    const rows = [
      baseRow({ tag: "TAG1", secondaryTag: "CHIP1" }),
      baseRow({ tag: "TAG2", secondaryTag: "CHIP1" }),
    ];

    const resolved = await resolveImportRows(rows);

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
    const [seededFarmGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(farm)
      .values({ groupId: seededFarmGroup.id, name: "San Antonio" })
      .returning();
    const [existingAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({
      animalId: existingAnimal.id,
      tag: "OTHERTAG",
      secondaryTag: "CHIP1",
    });

    const [resolved] = await resolveImportRows([
      baseRow({ tag: "TAG1", secondaryTag: "CHIP1" }),
    ]);

    expect(resolved).toEqual({
      status: "error",
      tag: "TAG1",
      reason: "Chip secundario ya asignado a otro animal",
    });
    void seededFarm;
  });
});
