// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, product, columnMapping, owner, dicoseRegistration, ownTag } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { previewHealthBatch, confirmHealthBatchAction, createProductAction, createOwnerAction } = await import(
  "../../app/(protected)/activities/health/actions"
);
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function buildWorkbookBuffer(headers: string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function seedManagerSession() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });

  vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === "active_farm_id" ? { value: seededFarm.id } : undefined),
  } as never);

  return { manager, seededFarm };
}

async function seedOwnTag(tag: string, farmId: string, ownerName: string) {
  const [createdOwner] = await testDb.insert(owner).values({ name: ownerName }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: createdOwner.id, farmId, dicoseCode: "999999999" })
    .returning();
  await testDb.insert(ownTag).values({ tag, dicoseRegistrationId: registration.id });
  return createdOwner;
}

describe("previewHealthBatch", () => {
  it("asks for a column mapping the first time a header signature is seen", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000080"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(true);
  });

  it("applies a submitted mapping and resolves rows", async () => {
    const { manager, seededFarm } = await seedManagerSession();
    await seedOwnTag("AR000000000081", seededFarm.id, "AIP");
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000081"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("new");
    }
  });

  it("reopens the mapping step, pre-filled, when the saved mapping still has an ignored column", async () => {
    await seedManagerSession();
    await testDb.insert(columnMapping).values({
      headerSignature: JSON.stringify(["IDE", "SEXO"]),
      mapping: [
        { header: "IDE", meaning: "tag" },
        { header: "SEXO", meaning: "ignore" },
      ],
    });

    const buffer = await buildWorkbookBuffer(["IDE", "SEXO"], [["AR000000000100", "M"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
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

  it("applies the saved mapping silently when no column is left ignored", async () => {
    await seedManagerSession();
    await testDb
      .insert(columnMapping)
      .values({ headerSignature: JSON.stringify(["IDE"]), mapping: [{ header: "IDE", meaning: "tag" }] });

    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000101"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
  });

  it("suggests a product row per product-mapped column, matched against the catalog when possible", async () => {
    await seedManagerSession();
    const [matchedProduct] = await testDb.insert(product).values({ name: "Aftosa" }).returning();

    const buffer = await buildWorkbookBuffer(
      ["IDE", "SANIDAD", "SANIDAD 2"],
      [["AR000000000110", "ASPERSIN", "Aftosa"]]
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "SANIDAD", meaning: "product" },
        { header: "SANIDAD 2", meaning: "product" },
      ])
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      expect(result.productSuggestions).toEqual([
        { rawValue: "ASPERSIN", matchedProductId: null },
        { rawValue: "Aftosa", matchedProductId: matchedProduct.id },
      ]);
    }
  });

  it("resolves rows immediately when a date column is mapped, without needing a supplied event date", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(
      ["IDE", "Fecha"],
      [["AR000000000111", "2026-03-10"]]
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ])
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.eventDateNeeded).toBe(false);
      if (!result.eventDateNeeded) {
        expect(result.rows[0].eventDate).toBe("2026-03-10");
      }
    }
  });

  it("asks for an event date when no column is mapped as date and none was supplied", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000112"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.eventDateNeeded).toBe(true);
    }
  });

  it("resolves rows once an event date is supplied for a file with no date column", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000113"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.eventDateNeeded).toBe(false);
      if (!result.eventDateNeeded) {
        expect(result.rows[0].eventDate).toBe("2026-02-01");
      }
    }
  });

  it("marks an unregistered tag as foreign when there is no matching own_tag record", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000299"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      expect(result.rows[0].status).toBe("foreign");
    }
  });
});

describe("confirmHealthBatchAction", () => {
  it("saves a new mapping and confirms the batch", async () => {
    const { seededFarm } = await seedManagerSession();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
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
    });

    const [savedMapping] = await testDb
      .select()
      .from(columnMapping)
      .where(eq(columnMapping.headerSignature, JSON.stringify(["IDE"])));
    expect(savedMapping).toBeDefined();
  });

  it("overwrites a previously cached mapping when the user corrects it on a later import", async () => {
    await seedManagerSession();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const headerSignature = JSON.stringify(["IDE", "NOTA"]);

    // A first import cached NOTA as "ignore" (e.g. a mistake).
    await testDb.insert(columnMapping).values({
      headerSignature,
      mapping: [
        { header: "IDE", meaning: "tag" },
        { header: "NOTA", meaning: "ignore" },
      ],
    });

    // A later import corrects it to "notes" — the correction must stick,
    // not be silently discarded by the cache.
    await confirmHealthBatchAction({
      headerSignature,
      mapping: [
        { header: "IDE", meaning: "tag" },
        { header: "NOTA", meaning: "notes" },
      ],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
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
    });

    const [savedMapping] = await testDb
      .select()
      .from(columnMapping)
      .where(eq(columnMapping.headerSignature, headerSignature));
    expect(savedMapping.mapping).toEqual([
      { header: "IDE", meaning: "tag" },
      { header: "NOTA", meaning: "notes" },
    ]);

    const { event } = await import("@/db/schema");
    const events = await testDb.select().from(event);
    const healthEvent = events.find((e) => e.eventType === "health");
    expect(healthEvent?.notes).toBe("cojera");
  });

  it("excludes an unforced foreign row from the confirmed batch", async () => {
    await seedManagerSession();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
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
    });

    const { animal } = await import("@/db/schema");
    const created = await testDb.select().from(animal);
    expect(created).toHaveLength(0);
  });

  it("creates the animal for a forced foreign row", async () => {
    await seedManagerSession();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
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

  it("confirms a wrong_farm row, creating the animal with its DICOSE-inferred owner", async () => {
    await seedManagerSession();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: createdOwner.id, farmId: otherFarm.id, dicoseCode: "151518192" });
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
      ],
      rows: [
        {
          tag: "AR000000000086",
          eventDate: "2026-02-01",
          notes: null,
          status: "wrong_farm",
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: createdOwner.id,
          registeredFarmId: otherFarm.id,
          registeredFarmName: "Cuatro Cerros",
        },
      ],
      paddockId: null,
    });

    const { animal } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    expect(createdAnimals[0].ownerId).toBe(createdOwner.id);
  });
});

describe("createProductAction", () => {
  it("creates a product and returns it", async () => {
    await seedManagerSession();

    const created = await createProductAction("Ivermectina 1%");

    expect(created.name).toBe("Ivermectina 1%");
    const [stored] = await testDb.select().from(product).where(eq(product.name, "Ivermectina 1%"));
    expect(stored).toBeDefined();
  });
});

describe("createOwnerAction", () => {
  it("creates an owner and returns it", async () => {
    await seedManagerSession();

    const created = await createOwnerAction("Pérez");

    expect(created.name).toBe("Pérez");
  });
});
