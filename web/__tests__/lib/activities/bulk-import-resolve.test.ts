import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farm, animalTagHistory, animal } from "@/db/schema";
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
    const [seededFarm] = await testDb.insert(farm).values({ name: "San Antonio" }).returning();

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
    await testDb.insert(farm).values({ name: "San Antonio" });
    const [resolved] = await resolveImportRows([baseRow({ tag: "" })]);
    expect(resolved).toEqual({ status: "error", tag: "", reason: "Falta la caravana" });
  });

  it("errors every row sharing a tag that's duplicated within the file", async () => {
    await testDb.insert(farm).values({ name: "San Antonio" });
    const rows = [baseRow(), baseRow()];

    const resolved = await resolveImportRows(rows);

    expect(resolved).toEqual([
      { status: "error", tag: "858000048233520", reason: "Caravana duplicada en el archivo" },
      { status: "error", tag: "858000048233520", reason: "Caravana duplicada en el archivo" },
    ]);
  });

  it("errors a row whose tag already exists in the system", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "San Antonio" }).returning();
    const [existingAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: existingAnimal.id, tag: "858000048233520" });

    const [resolved] = await resolveImportRows([baseRow()]);

    expect(resolved).toEqual({
      status: "error",
      tag: "858000048233520",
      reason: "La caravana ya existe en el sistema",
    });
    void seededFarm;
  });

  it("errors a row whose Estancia doesn't match any existing farm", async () => {
    const [resolved] = await resolveImportRows([baseRow({ farmName: "Estancia Inexistente" })]);
    expect(resolved).toEqual({ status: "error", tag: "858000048233520", reason: "Estancia no reconocida" });
  });

  it("errors a row with no parseable Fecha alta en sistema", async () => {
    await testDb.insert(farm).values({ name: "San Antonio" });
    const [resolved] = await resolveImportRows([baseRow({ eventDate: null })]);
    expect(resolved).toEqual({ status: "error", tag: "858000048233520", reason: "Falta fecha de alta" });
  });

  it("leaves sex and birth date null when they don't match a known value, without erroring the row", async () => {
    await testDb.insert(farm).values({ name: "San Antonio" });
    const [resolved] = await resolveImportRows([baseRow({ sex: "??", birthDate: "no-date" })]);
    expect(resolved).toMatchObject({ status: "valid", sex: null, birthDate: null });
  });

  it("errors every row sharing a secondaryTag that's duplicated within the file", async () => {
    await testDb.insert(farm).values({ name: "San Antonio" });
    const rows = [
      baseRow({ tag: "TAG1", secondaryTag: "CHIP1" }),
      baseRow({ tag: "TAG2", secondaryTag: "CHIP1" }),
    ];

    const resolved = await resolveImportRows(rows);

    expect(resolved).toEqual([
      { status: "error", tag: "TAG1", reason: "Chip secundario duplicado en el archivo" },
      { status: "error", tag: "TAG2", reason: "Chip secundario duplicado en el archivo" },
    ]);
  });

  it("errors a row whose secondaryTag already exists in animal_tag_history", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "San Antonio" }).returning();
    const [existingAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({
      animalId: existingAnimal.id,
      tag: "OTHERTAG",
      secondaryTag: "CHIP1",
    });

    const [resolved] = await resolveImportRows([baseRow({ tag: "TAG1", secondaryTag: "CHIP1" })]);

    expect(resolved).toEqual({
      status: "error",
      tag: "TAG1",
      reason: "Chip secundario ya asignado a otro animal",
    });
    void seededFarm;
  });
});
