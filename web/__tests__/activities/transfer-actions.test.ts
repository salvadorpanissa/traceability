// @vitest-environment node
// This suite exercises Server Actions with real File/Blob uploads. jsdom's
// polyfilled Blob doesn't implement arrayBuffer(), so this file runs in the
// plain Node environment (which has full native FormData/File/Blob) instead
// of the project's default jsdom environment.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, columnMapping, owner, dicoseRegistration, ownTag } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { previewTransferBatch, confirmTransferBatchAction, createOwnerAction, listPaddocksAction, createPaddockAction } =
  await import("../../app/(protected)/activities/transfer/actions");
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

describe("previewTransferBatch", () => {
  it("asks for a column mapping the first time a header signature is seen", async () => {
    const { seededFarm } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000020"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(true);
  });

  it("applies a submitted mapping and resolves rows without saving it yet", async () => {
    const { manager, seededFarm } = await seedManagerSession();
    await seedOwnTag("AR000000000021", seededFarm.id, "AIP");
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000021"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("new");
    }

    const savedMappings = await testDb.select().from(columnMapping);
    expect(savedMappings).toHaveLength(0);
  });

  it("reuses a previously saved mapping for the same header signature", async () => {
    const { seededFarm } = await seedManagerSession();
    await testDb
      .insert(columnMapping)
      .values({ headerSignature: JSON.stringify(["IDE"]), mapping: [{ header: "IDE", meaning: "tag" }] });

    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000022"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
  });

  it("reopens the mapping step, pre-filled, when the saved mapping still has an ignored column", async () => {
    const { seededFarm } = await seedManagerSession();
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
    formData.set("farmId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(true);
    if (result.mappingNeeded) {
      expect(result.initialMapping).toEqual([
        { header: "IDE", meaning: "tag" },
        { header: "SEXO", meaning: "ignore" },
      ]);
    }
  });

  it("applies the saved mapping silently when no column is left ignored", async () => {
    const { seededFarm } = await seedManagerSession();
    await testDb
      .insert(columnMapping)
      .values({ headerSignature: JSON.stringify(["IDE"]), mapping: [{ header: "IDE", meaning: "tag" }] });

    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000101"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
  });

  it("resolves rows immediately when a date column is mapped, without needing a supplied event date", async () => {
    const { seededFarm } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE", "Fecha"], [["AR000000000102", "2026-03-10"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ])
    );

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.eventDateNeeded).toBe(false);
      if (!result.eventDateNeeded) {
        expect(result.rows[0].eventDate).toBe("2026-03-10");
      }
    }
  });

  it("asks for an event date when no column is mapped as date and none was supplied", async () => {
    const { seededFarm } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000103"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.eventDateNeeded).toBe(true);
    }
  });

  it("resolves rows once an event date is supplied for a file with no date column", async () => {
    const { seededFarm } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000104"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.eventDateNeeded).toBe(false);
      if (!result.eventDateNeeded) {
        expect(result.rows[0].eventDate).toBe("2026-02-01");
      }
    }
  });

  it("marks an unregistered tag as foreign when there is no matching own_tag record", async () => {
    const { seededFarm } = await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000199"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("farmId", seededFarm.id);
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      expect(result.rows[0].status).toBe("foreign");
    }
  });
});

describe("confirmTransferBatchAction", () => {
  it("saves a new mapping and confirms the batch", async () => {
    const { seededFarm } = await seedManagerSession();

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [
        {
          tag: "AR000000000023",
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
    });

    const [savedMapping] = await testDb
      .select()
      .from(columnMapping)
      .where(eq(columnMapping.headerSignature, JSON.stringify(["IDE"])));
    expect(savedMapping).toBeDefined();
  });

  it("excludes an unforced foreign row from the confirmed batch", async () => {
    const { seededFarm } = await seedManagerSession();

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [
        {
          tag: "AR000000000024",
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
    });

    const { animal } = await import("@/db/schema");
    const created = await testDb.select().from(animal);
    expect(created).toHaveLength(0);
  });

  it("creates the animal for a forced foreign row", async () => {
    const { seededFarm } = await seedManagerSession();

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [
        {
          tag: "AR000000000025",
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
    });

    const { animal, animalTagHistory } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    const tagRows = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, createdAnimals[0].id));
    expect(tagRows[0].tag).toBe("AR000000000025");
  });

  it("confirms a wrong_farm row, creating the animal with its DICOSE-inferred owner", async () => {
    const { seededFarm } = await seedManagerSession();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: createdOwner.id, farmId: otherFarm.id, dicoseCode: "151518192" });

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [
        {
          tag: "AR000000000026",
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
    });

    const { animal } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    expect(createdAnimals[0].ownerId).toBe(createdOwner.id);
  });
});

describe("createOwnerAction", () => {
  it("creates an owner and returns it", async () => {
    await seedManagerSession();

    const created = await createOwnerAction("Pérez");

    expect(created.name).toBe("Pérez");
  });
});

describe("listPaddocksAction and createPaddockAction", () => {
  it("creates a paddock under a farm the user has access to, then lists it", async () => {
    const { seededFarm } = await seedManagerSession();

    const created = await createPaddockAction(seededFarm.id, "Potrero 1");
    expect(created.name).toBe("Potrero 1");

    const listed = await listPaddocksAction(seededFarm.id);
    expect(listed).toEqual([{ id: created.id, name: "Potrero 1", farmId: seededFarm.id }]);
  });

  it("rejects creating a paddock in a farm the user doesn't have access to", async () => {
    await seedManagerSession();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();

    await expect(createPaddockAction(otherFarm.id, "Potrero 1")).rejects.toThrow();
  });
});
