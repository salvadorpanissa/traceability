// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, userFarm, batchOperation } from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/transfer";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { confirmTransferBatch } = await import("@/lib/activities/transfer");
const { listGuideDocuments } = await import("@/lib/dal/guide-documents");
const { downloadGuideDocumentAction } = await import("../../../app/(protected)/settings/guides/actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm() {
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

describe("downloadGuideDocumentAction", () => {
  it("returns the guide document base64-encoded", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      guideNumber: "D838153",
      guideDocument: { fileName: "D838153.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.4 fake") },
      rows: sampleRows(),
    });
    const [{ batchId }] = await listGuideDocuments(manager.id, "manager");

    const result = await downloadGuideDocumentAction(batchId);

    expect(result).toEqual({
      fileName: "D838153.pdf",
      mimeType: "application/pdf",
      base64: Buffer.from("%PDF-1.4 fake").toString("base64"),
    });
  });

  it("returns null for a batch with no guide document", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: sampleRows(),
    });
    const [batch] = await testDb.select().from(batchOperation);

    const result = await downloadGuideDocumentAction(batch.id);

    expect(result).toBeNull();
  });

  it("rejects when the logged-in user lacks access to the batch's farm", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      guideNumber: "D838153",
      guideDocument: { fileName: "D838153.pdf", mimeType: "application/pdf", data: Buffer.from("hello") },
      rows: sampleRows(),
    });
    const [batch] = await testDb.select().from(batchOperation);

    const [existingManagerRole] = await testDb.select().from(role).where(eq(role.name, "manager"));
    const [otherManager] = await testDb
      .insert(userAccount)
      .values({ name: "Other", email: "other@example.com", passwordHash: "hashed", roleId: existingManagerRole.id })
      .returning();
    vi.mocked(auth).mockResolvedValue({ user: { id: otherManager.id, role: "manager" } } as never);

    await expect(downloadGuideDocumentAction(batch.id)).rejects.toThrow();
  });
});
