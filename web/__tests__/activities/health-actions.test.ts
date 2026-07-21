// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, product, columnMapping } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { previewHealthBatch, confirmHealthBatchAction, createProductAction } = await import(
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
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000081"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
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
    if (!result.mappingNeeded) {
      expect(result.productSuggestions).toEqual([
        { rawValue: "ASPERSIN", matchedProductId: null },
        { rawValue: "Aftosa", matchedProductId: matchedProduct.id },
      ]);
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
      rows: [{ tag: "AR000000000082", eventDate: "2026-02-01", status: "new", categoryId: null }],
    });

    const [savedMapping] = await testDb
      .select()
      .from(columnMapping)
      .where(eq(columnMapping.headerSignature, JSON.stringify(["IDE"])));
    expect(savedMapping).toBeDefined();
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
