import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  farmGroup,
  role,
  farm,
  userAccount,
  batchOperation,
  saleSettlement,
} from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function seedBatchAndUser() {
  const [adminRole] = await testDb
    .insert(role)
    .values({ name: "admin" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farmGroup)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(farm)
    .values({ groupId: seededFarmGroup.id, name: "Campo Norte" })
    .returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({
      name: "Admin",
      email: "admin@example.com",
      passwordHash: "hashed",
      roleId: adminRole.id,
    })
    .returning();
  const [batch] = await testDb
    .insert(batchOperation)
    .values({
      eventType: "sale",
      farmId: seededFarm.id,
      animalCount: 2,
      createdBy: user.id,
    })
    .returning();
  return { batch, user };
}

describe("sale_settlement table", () => {
  it("stores a liquidación linked to a batch operation, with its PDF attached", async () => {
    const { batch, user } = await seedBatchAndUser();

    const [created] = await testDb
      .insert(saleSettlement)
      .values({
        batchOperationId: batch.id,
        guideNumber: "D963691",
        frigorifico: "Cledinor S.A.",
        weighDate: "2026-07-11",
        totalAmount: "23396.21",
        fileName: "liquidacion.pdf",
        mimeType: "application/pdf",
        fileData: Buffer.from("fake-pdf"),
        createdBy: user.id,
      })
      .returning();

    expect(created.guideNumber).toBe("D963691");
    expect(created.totalAmount).toBe("23396.21");
    expect(created.fileData.toString()).toBe("fake-pdf");

    const [stored] = await testDb
      .select()
      .from(saleSettlement)
      .where(eq(saleSettlement.id, created.id));
    expect(stored.batchOperationId).toBe(batch.id);
  });
});
