import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { eq } from "drizzle-orm";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  batchOperation,
} from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/transfer";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmTransferBatch } = await import("@/lib/activities/transfer");
const { listGuideDocuments, getGuideDocumentFile } =
  await import("@/lib/dal/guide-documents");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm(establishmentName = "Campo Norte") {
  const [managerRole] = await testDb
    .insert(role)
    .values({ name: "manager" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: establishmentName })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: establishmentName })
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
  return { manager, seededFarm };
}

function sampleRows(): ResolvedRow[] {
  return [
    {
      tag: "AR000000000011",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: null,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    },
  ];
}

describe("listGuideDocuments", () => {
  it("lists a PDF-sourced batch with identifying info", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      guideNumber: "D838153",
      guideDocument: {
        fileName: "D838153.pdf",
        mimeType: "application/pdf",
        data: Buffer.from("%PDF-1.4 fake"),
      },
      rows: sampleRows(),
    });

    const guides = await listGuideDocuments(manager.id, "manager");

    expect(guides).toHaveLength(1);
    expect(guides[0]).toMatchObject({
      fileName: "D838153.pdf",
      mimeType: "application/pdf",
      animalCount: 1,
      guideNumber: "D838153",
      originEstablishmentName: seededFarm.name,
      destinationEstablishmentName: seededFarm.name,
    });
  });

  it("excludes Excel-sourced batches (no guide document)", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows: sampleRows(),
    });

    expect(await listGuideDocuments(manager.id, "manager")).toEqual([]);
  });

  it("scopes results to the manager's assigned establishment", async () => {
    const { manager } = await seedManagerAndFarm();
    const [otherFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [otherFarm] = await testDb
      .insert(establishment)
      .values({ farmId: otherFarmGroup.id, name: "Campo Sur" })
      .returning();
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
      .returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({
        name: "Admin",
        email: "admin@example.com",
        passwordHash: "hashed",
        roleId: adminRole.id,
      })
      .returning();

    await confirmTransferBatch({
      userId: admin.id,
      role: "admin",
      operatingEstablishmentId: otherFarm.id,
      destinationEstablishmentId: otherFarm.id,
      destinationPaddockId: null,
      guideNumber: "OTHER-1",
      guideDocument: {
        fileName: "other.pdf",
        mimeType: "application/pdf",
        data: Buffer.from("x"),
      },
      rows: sampleRows(),
    });

    expect(await listGuideDocuments(manager.id, "manager")).toEqual([]);
    expect(await listGuideDocuments(admin.id, "admin")).toHaveLength(1);
  });
});

describe("getGuideDocumentFile", () => {
  it("returns the stored bytes for an accessible batch", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      guideNumber: "D838153",
      guideDocument: {
        fileName: "D838153.pdf",
        mimeType: "application/pdf",
        data: Buffer.from("hello"),
      },
      rows: sampleRows(),
    });
    const [{ batchId }] = await listGuideDocuments(manager.id, "manager");

    const file = await getGuideDocumentFile(batchId, manager.id, "manager");

    expect(file).toEqual({
      fileName: "D838153.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("hello"),
    });
  });

  it("returns null for a batch with no guide document", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows: sampleRows(),
    });
    const [batchOp] = await testDb.select().from(batchOperation);

    expect(
      await getGuideDocumentFile(batchOp.id, manager.id, "manager"),
    ).toBeNull();
  });

  it("rejects a manager without access to the batch's establishment", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      guideNumber: "D838153",
      guideDocument: {
        fileName: "D838153.pdf",
        mimeType: "application/pdf",
        data: Buffer.from("hello"),
      },
      rows: sampleRows(),
    });
    const [batchOp] = await testDb.select().from(batchOperation);

    const [existingManagerRole] = await testDb
      .select()
      .from(role)
      .where(eq(role.name, "manager"));
    const [otherManager] = await testDb
      .insert(userAccount)
      .values({
        name: "Other",
        email: "other@example.com",
        passwordHash: "hashed",
        roleId: existingManagerRole.id,
      })
      .returning();

    await expect(
      getGuideDocumentFile(batchOp.id, otherManager.id, "manager"),
    ).rejects.toThrow();
  });

  it("rejects a manager without access even when the batch has no guide document, rather than distinguishing the two as null vs. thrown", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows: sampleRows(),
    });
    const [batchOp] = await testDb.select().from(batchOperation);

    const [existingManagerRole] = await testDb
      .select()
      .from(role)
      .where(eq(role.name, "manager"));
    const [otherManager] = await testDb
      .insert(userAccount)
      .values({
        name: "Other",
        email: "other2@example.com",
        passwordHash: "hashed",
        roleId: existingManagerRole.id,
      })
      .returning();

    await expect(
      getGuideDocumentFile(batchOp.id, otherManager.id, "manager"),
    ).rejects.toThrow();
  });
});
