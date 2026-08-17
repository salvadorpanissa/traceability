// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  product,
  columnHeaderMeaning,
  owner,
  dicose,
  ownTag,
  reproductiveStatus,
} from "@/db/schema";
import { applyColumnMapping } from "@/lib/activities/column-mapping";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const {
  previewHealthBatch,
  confirmHealthBatchAction,
  createProductAction,
  createOwnerAction,
} = await import("../../app/(protected)/activities/health/actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function buildWorkbookBuffer(
  headers: string[],
  rows: string[][],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const r of rows) sheet.addRow(r);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

async function seedManagerSession() {
  const [managerRole] = await testDb
    .insert(role)
    .values({ name: "manager" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
    .returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({
      name: "Manager",
      email: "manager@example.com",
      passwordHash: "hashed",
      roleId: managerRole.id,
    })
    .returning();
  await testDb
    .insert(userFarm)
    .values({ userId: manager.id, farmId: seededFarmGroup.id });

  vi.mocked(auth).mockResolvedValue({
    user: { id: manager.id, role: "manager" },
  } as never);

  return { manager, seededFarm, seededFarmGroup };
}

async function seedOwnTag(
  tag: string,
  establishmentId: string,
  ownerName: string,
  farmId: string,
) {
  const [createdOwner] = await testDb
    .insert(owner)
    .values({ name: ownerName, farmId })
    .returning();
  const [registration] = await testDb
    .insert(dicose)
    .values({ ownerId: createdOwner.id, establishmentId, dicoseCode: "999999999" })
    .returning();
  await testDb
    .insert(ownTag)
    .values({ tag, dicoseId: registration.id });
  return createdOwner;
}

describe("previewHealthBatch", () => {
  it("asks for a column mapping the first time a header signature is seen", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000080"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(true);
  });

  it("applies a submitted mapping and resolves rows", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    await seedOwnTag("AR000000000081", seededFarm.id, "AIP", seededFarmGroup.id);
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000081"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([{ header: "IDE", meaning: "tag" }]),
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.valueLegendNeeded && !result.eventDateNeeded) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("new");
    }
  });

  it("pre-fills the mapping step from each header's individually remembered meaning, instead of applying it silently", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    await testDb.insert(columnHeaderMeaning).values([
      { header: "IDE", meaning: "tag" },
      { header: "SEXO", meaning: "ignore" },
    ]);

    const buffer = await buildWorkbookBuffer(
      ["IDE", "SEXO"],
      [["AR000000000100", "M"]],
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(true);
    if (result.mappingNeeded) {
      expect(result.initialMapping).toEqual([
        { header: "IDE", meaning: "tag" },
        { header: "SEXO", meaning: "ignore" },
      ]);
    }
  });

  it("pre-fills only the headers it recognizes when the rest of the combination is new", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    await testDb.insert(columnHeaderMeaning).values({ header: "IDE", meaning: "tag" });

    // "IDE" was seen before (in some other file's combination), "RAZA"
    // never was — the remembered meaning should still surface for "IDE".
    const buffer = await buildWorkbookBuffer(
      ["IDE", "RAZA"],
      [["AR000000000101", "Angus"]],
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(true);
    if (result.mappingNeeded) {
      expect(result.initialMapping).toEqual([
        { header: "IDE", meaning: "tag" },
        { header: "RAZA", meaning: "ignore" },
      ]);
    }
  });

  it("asks for a mapping again even when nothing about this header was left ignored last time, so the user can confirm it", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    await testDb.insert(columnHeaderMeaning).values({ header: "IDE", meaning: "tag" });

    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000102"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(true);
    if (result.mappingNeeded) {
      expect(result.initialMapping).toEqual([{ header: "IDE", meaning: "tag" }]);
    }
  });

  it("suggests a product row per product-mapped column, matched against the catalog when possible", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const [matchedProduct] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Aftosa" })
      .returning();

    const buffer = await buildWorkbookBuffer(
      ["IDE", "SANIDAD", "SANIDAD 2"],
      [["AR000000000110", "ASPERSIN", "Aftosa"]],
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "SANIDAD", meaning: "product" },
        { header: "SANIDAD 2", meaning: "product" },
      ]),
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.valueLegendNeeded && !result.eventDateNeeded) {
      expect(result.productSuggestions).toEqual([
        { rawValue: "ASPERSIN", matchedProductId: null },
        { rawValue: "Aftosa", matchedProductId: matchedProduct.id },
      ]);
    }
  });

  it("resolves rows immediately when a date column is mapped, without needing a supplied event date", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(
      ["IDE", "Fecha"],
      [["AR000000000111", "2026-03-10"]],
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ]),
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.valueLegendNeeded) {
      expect(result.eventDateNeeded).toBe(false);
      if (!result.eventDateNeeded) {
        expect(result.rows[0].eventDate).toBe("2026-03-10");
      }
    }
  });

  it("asks for an event date when no column is mapped as date and none was supplied", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000112"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set(
      "mapping",
      JSON.stringify([{ header: "IDE", meaning: "tag" }]),
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.valueLegendNeeded) {
      expect(result.eventDateNeeded).toBe(true);
    }
  });

  it("resolves rows once an event date is supplied for a file with no date column", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000113"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([{ header: "IDE", meaning: "tag" }]),
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.valueLegendNeeded) {
      expect(result.eventDateNeeded).toBe(false);
      if (!result.eventDateNeeded) {
        expect(result.rows[0].eventDate).toBe("2026-02-01");
      }
    }
  });

  it("marks an unregistered tag as foreign when there is no matching own_tag record", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000299"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([{ header: "IDE", meaning: "tag" }]),
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.valueLegendNeeded && !result.eventDateNeeded) {
      expect(result.rows[0].status).toBe("foreign");
    }
  });

  it("asks for a value legend when a reproductiveStatus column has no map covering its distinct values yet", async () => {
    const { seededFarm } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(
      ["IDE", "Fecha", "Preñez"],
      [
        ["AR000000000090", "2026-02-01", "1"],
        ["AR000000000091", "2026-02-01", "2"],
      ]
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
        { header: "Preñez", meaning: "reproductiveStatus" },
      ])
    );

    const result = await previewHealthBatch(formData);

    expect(result).toMatchObject({ mappingNeeded: false, valueLegendNeeded: true, distinctValues: ["1", "2"] });
  });

  it("proceeds past the legend once the value map covers every distinct value", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    await seedOwnTag("AR000000000092", seededFarm.id, "AIP", seededFarmGroup.id);
    const [statusA] = await testDb.insert(reproductiveStatus).values({ farmId: seededFarmGroup.id, name: "Preñada" }).returning();
    const [statusB] = await testDb.insert(reproductiveStatus).values({ farmId: seededFarmGroup.id, name: "Vacía" }).returning();
    const buffer = await buildWorkbookBuffer(
      ["IDE", "Fecha", "Preñez"],
      [["AR000000000092", "2026-02-01", "1"]]
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
        {
          header: "Preñez",
          meaning: "reproductiveStatus",
          reproductiveStatusValueMap: { "1": statusA.id, "2": statusB.id },
        },
      ])
    );

    const result = await previewHealthBatch(formData);

    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) expect(result.valueLegendNeeded).toBe(false);
  });

  it("proceeds past the legend and resolves to null when a distinct value is explicitly mapped to sin dato", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    await seedOwnTag("AR000000000093", seededFarm.id, "AIP", seededFarmGroup.id);
    await seedOwnTag("AR000000000094", seededFarm.id, "AIP 2", seededFarmGroup.id);
    const [statusA] = await testDb.insert(reproductiveStatus).values({ farmId: seededFarmGroup.id, name: "Preñada" }).returning();
    const headers = ["IDE", "Fecha", "Preñez"];
    const rawRows = [
      ["AR000000000093", "2026-02-01", "1"],
      ["AR000000000094", "2026-02-01", "2"],
    ];
    const buffer = await buildWorkbookBuffer(headers, rawRows);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    const mapping = [
      { header: "IDE", meaning: "tag" },
      { header: "Fecha", meaning: "date" },
      {
        header: "Preñez",
        meaning: "reproductiveStatus",
        reproductiveStatusValueMap: { "1": statusA.id, "2": "" },
      },
    ];
    formData.set("mapping", JSON.stringify(mapping));

    const result = await previewHealthBatch(formData);

    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) expect(result.valueLegendNeeded).toBe(false);

    const mappedRows = applyColumnMapping(headers, rawRows, mapping as never);
    expect(mappedRows[0].reproductiveStatusId).toBe(statusA.id);
    expect(mappedRows[1].reproductiveStatusId).toBeNull();
  });

  it("re-shows the legend instead of silently applying another farm's status IDs on a matching header+code collision", async () => {
    const { seededFarmGroup: farmA } = await seedManagerSession();
    const [statusFarmA] = await testDb.insert(reproductiveStatus).values({ farmId: farmA.id, name: "Preñada" }).returning();
    const headers = ["IDE", "Fecha", "Preñez"];
    const mapping = [
      { header: "IDE", meaning: "tag" },
      { header: "Fecha", meaning: "date" },
      { header: "Preñez", meaning: "reproductiveStatus", reproductiveStatusValueMap: { "1": statusFarmA.id } },
    ];

    // Farm B submits a mapping referencing farm A's status ID (e.g. copied
    // from another vet's file) but was never granted access to it.
    const [farmB] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [farmBEstablishment] = await testDb.insert(establishment).values({ farmId: farmB.id, name: "Cuatro Cerros" }).returning();
    const [manager] = await testDb.select().from(userAccount);
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: farmB.id });

    const buffer = await buildWorkbookBuffer(headers, [["AR000000000095", "2026-02-01", "1"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("establishmentId", farmBEstablishment.id);
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify(mapping));

    const result = await previewHealthBatch(formData);

    expect(result).toMatchObject({ mappingNeeded: false, valueLegendNeeded: true });
  });
});

describe("confirmHealthBatchAction", () => {
  it("saves a new mapping and confirms the batch", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        {
          productId: productA.id,
          dose: "10",
          doseUnit: "ml",
          route: "subcutánea",
          withdrawalDays: null,
          notes: null,
        },
      ],
      rows: [
        {
          tag: "AR000000000082",
          eventDate: "2026-02-01",
          notes: null,
          status: "new",
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
      paddockId: null,
      establishmentId: seededFarm.id,
    });

    const [savedMeaning] = await testDb
      .select()
      .from(columnHeaderMeaning)
      .where(eq(columnHeaderMeaning.header, "IDE"));
    expect(savedMeaning?.meaning).toBe("tag");
  });

  it("overwrites a previously remembered header meaning when the user corrects it on a later import", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();
    const headerSignature = JSON.stringify(["IDE", "NOTA"]);

    // A first import remembered NOTA as "ignore" (e.g. a mistake).
    await testDb.insert(columnHeaderMeaning).values([
      { header: "IDE", meaning: "tag" },
      { header: "NOTA", meaning: "ignore" },
    ]);

    // A later import corrects it to "notes" — the correction must stick,
    // not be silently discarded by the cache.
    await confirmHealthBatchAction({
      headerSignature,
      mapping: [
        { header: "IDE", meaning: "tag" },
        { header: "NOTA", meaning: "notes" },
      ],
      products: [
        {
          productId: productA.id,
          dose: "10",
          doseUnit: "ml",
          route: "subcutánea",
          withdrawalDays: null,
          notes: null,
        },
      ],
      rows: [
        {
          tag: "AR000000000083",
          eventDate: "2026-02-01",
          notes: "cojera",
          status: "new",
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
      paddockId: null,
      establishmentId: seededFarm.id,
    });

    const savedMeanings = await testDb
      .select()
      .from(columnHeaderMeaning)
      .where(inArray(columnHeaderMeaning.header, ["IDE", "NOTA"]));
    expect(savedMeanings.find((m) => m.header === "NOTA")?.meaning).toBe("notes");

    const { event } = await import("@/db/schema");
    const events = await testDb.select().from(event);
    const healthEvent = events.find((e) => e.eventType === "health");
    expect(healthEvent?.notes).toBe("cojera");
  });

  it("excludes an unforced foreign row from the confirmed batch", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        {
          productId: productA.id,
          dose: "10",
          doseUnit: "ml",
          route: "subcutánea",
          withdrawalDays: null,
          notes: null,
        },
      ],
      rows: [
        {
          tag: "AR000000000084",
          eventDate: "2026-02-01",
          notes: null,
          status: "foreign",
          forced: false,
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
      paddockId: null,
      establishmentId: seededFarm.id,
    });

    const { animal } = await import("@/db/schema");
    const created = await testDb.select().from(animal);
    expect(created).toHaveLength(0);
  });

  it("creates the animal for a forced foreign row", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        {
          productId: productA.id,
          dose: "10",
          doseUnit: "ml",
          route: "subcutánea",
          withdrawalDays: null,
          notes: null,
        },
      ],
      rows: [
        {
          tag: "AR000000000085",
          eventDate: "2026-02-01",
          notes: null,
          status: "foreign",
          forced: true,
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
      paddockId: null,
      establishmentId: seededFarm.id,
    });

    const { animal, animalTagHistory } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    const tagRows = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, createdAnimals[0].id));
    expect(tagRows[0].tag).toBe("AR000000000085");
  });

  it("confirms a wrong_establishment row, creating the animal with its DICOSE-inferred owner", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const [otherFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [otherFarm] = await testDb
      .insert(establishment)
      .values({ farmId: otherFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [createdOwner] = await testDb
      .insert(owner)
      .values({ name: "AIP", farmId: otherFarmGroup.id })
      .returning();
    await testDb
      .insert(dicose)
      .values({
        ownerId: createdOwner.id,
        establishmentId: otherFarm.id,
        dicoseCode: "151518192",
      });
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        {
          productId: productA.id,
          dose: "10",
          doseUnit: "ml",
          route: "subcutánea",
          withdrawalDays: null,
          notes: null,
        },
      ],
      rows: [
        {
          tag: "AR000000000086",
          eventDate: "2026-02-01",
          notes: null,
          status: "wrong_establishment",
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: createdOwner.id,
          registeredEstablishmentId: otherFarm.id,
          registeredEstablishmentName: "Cuatro Cerros",
        },
      ],
      paddockId: null,
      establishmentId: seededFarm.id,
    });

    const { animal } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    expect(createdAnimals[0].ownerId).toBe(createdOwner.id);
  });

  it("creates a traslado for a mismatched potrero when transferMismatchedToPaddock is true", async () => {
    const { seededFarm, seededFarmGroup } = await seedManagerSession();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();
    const { paddock, animal, animalTagHistory, event, eventTransfer } =
      await import("@/db/schema");
    const [potreroA] = await testDb
      .insert(paddock)
      .values({ establishmentId: seededFarm.id, name: "Potrero A" })
      .returning();
    const [potreroB] = await testDb
      .insert(paddock)
      .values({ establishmentId: seededFarm.id, name: "Potrero B" })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR000000000087" });

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        {
          productId: productA.id,
          dose: "10",
          doseUnit: "ml",
          route: "subcutánea",
          withdrawalDays: null,
          notes: null,
        },
      ],
      rows: [
        {
          tag: "AR000000000087",
          eventDate: "2026-02-01",
          notes: null,
          status: "existing",
          animalId: createdAnimal.id,
          currentEstablishmentId: seededFarm.id,
          currentPaddockId: potreroB.id,
        },
      ],
      paddockId: potreroA.id,
      establishmentId: seededFarm.id,
      transferMismatchedToPaddock: true,
    });

    const animalEvents = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, createdAnimal.id));
    const transferEvent = animalEvents.find((e) => e.eventType === "transfer");
    expect(transferEvent).toBeDefined();
    const [transfer] = await testDb
      .select()
      .from(eventTransfer)
      .where(eq(eventTransfer.eventId, transferEvent!.id));
    expect(transfer.destinationPaddockId).toBe(potreroA.id);
  });
});

describe("createProductAction", () => {
  it("creates a product and returns it", async () => {
    const { seededFarm } = await seedManagerSession();

    const created = await createProductAction(seededFarm.id, "Ivermectina 1%");

    expect(created.name).toBe("Ivermectina 1%");
    const [stored] = await testDb
      .select()
      .from(product)
      .where(eq(product.name, "Ivermectina 1%"));
    expect(stored).toBeDefined();
  });
});

describe("createOwnerAction", () => {
  it("creates an owner and returns it", async () => {
    const { seededFarm } = await seedManagerSession();

    const created = await createOwnerAction(seededFarm.id, "Pérez");

    expect(created.name).toBe("Pérez");
  });
});
