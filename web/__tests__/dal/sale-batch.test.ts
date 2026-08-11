// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventSale,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { findSaleBatchByGuideNumber } = await import("@/lib/dal/sale-batch");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmAndUser(establishmentName: string) {
  const [adminRole] = await testDb
    .insert(role)
    .values({ name: "admin" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: establishmentName })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: establishmentName })
    .returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({
      name: "Admin",
      email: `admin-${establishmentName}@example.com`,
      passwordHash: "hashed",
      roleId: adminRole.id,
    })
    .returning();
  return { seededFarm, user };
}

async function seedSaleEvent(
  establishmentId: string,
  userId: string,
  batchId: string,
  tag: string,
  guideNumber: string,
  buyer: string | null,
  price: string | null,
  weightKg: string | null,
  eventDate: string,
) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb
    .insert(animalTagHistory)
    .values({ animalId: createdAnimal.id, tag });
  const [saleEvent] = await testDb
    .insert(event)
    .values({
      eventType: "sale",
      eventDate,
      animalId: createdAnimal.id,
      establishmentId,
      batchOperationId: batchId,
      createdBy: userId,
    })
    .returning();
  await testDb
    .insert(eventSale)
    .values({ eventId: saleEvent.id, guideNumber, buyer, price, weightKg });
  return createdAnimal;
}

describe("findSaleBatchByGuideNumber", () => {
  it("returns null when no sale has that guide number", async () => {
    const result = await findSaleBatchByGuideNumber("D000000", "all");
    expect(result).toBeNull();
  });

  it("groups every animal sold under the same guide number into one match", async () => {
    const { seededFarm, user } = await seedFarmAndUser("San Antonio");
    const [batch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "sale",
        establishmentId: seededFarm.id,
        animalCount: 2,
        createdBy: user.id,
      })
      .returning();
    await seedSaleEvent(
      seededFarm.id,
      user.id,
      batch.id,
      "TAG001",
      "D963691",
      "Cledinor S.A.",
      "5.27",
      "260",
      "2026-07-11",
    );
    await seedSaleEvent(
      seededFarm.id,
      user.id,
      batch.id,
      "TAG002",
      "D963691",
      "Cledinor S.A.",
      "5.27",
      "260",
      "2026-07-11",
    );

    const result = await findSaleBatchByGuideNumber("D963691", "all");

    expect(result).not.toBeNull();
    expect(result!.batchOperationId).toBe(batch.id);
    expect(result!.establishmentName).toBe("San Antonio");
    expect(result!.eventDate).toBe("2026-07-11");
    expect(result!.animalTags.sort()).toEqual(["TAG001", "TAG002"]);
    expect(result!.buyer).toBe("Cledinor S.A.");
    expect(result!.price).toBe("5.27");
    expect(result!.weightKg).toBe("260");
  });

  it("returns null buyer/price/weightKg when they were left blank on the venta", async () => {
    const { seededFarm, user } = await seedFarmAndUser("Cuatro Cerros");
    const [batch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "sale",
        establishmentId: seededFarm.id,
        animalCount: 1,
        createdBy: user.id,
      })
      .returning();
    await seedSaleEvent(
      seededFarm.id,
      user.id,
      batch.id,
      "TAG003",
      "D111111",
      null,
      null,
      null,
      "2026-07-11",
    );

    const result = await findSaleBatchByGuideNumber("D111111", "all");

    expect(result!.buyer).toBeNull();
    expect(result!.price).toBeNull();
    expect(result!.weightKg).toBeNull();
  });

  it("throws when the same guide number was used across two different batch operations", async () => {
    const { seededFarm, user } = await seedFarmAndUser("San Antonio");
    const [batchA] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "sale",
        establishmentId: seededFarm.id,
        animalCount: 1,
        createdBy: user.id,
      })
      .returning();
    const [batchB] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "sale",
        establishmentId: seededFarm.id,
        animalCount: 1,
        createdBy: user.id,
      })
      .returning();
    await seedSaleEvent(
      seededFarm.id,
      user.id,
      batchA.id,
      "TAG004",
      "D222222",
      null,
      null,
      null,
      "2026-07-11",
    );
    await seedSaleEvent(
      seededFarm.id,
      user.id,
      batchB.id,
      "TAG005",
      "D222222",
      null,
      null,
      null,
      "2026-07-12",
    );

    await expect(findSaleBatchByGuideNumber("D222222", "all")).rejects.toThrow(
      "Hay más de una venta",
    );
  });

  it("does not find a venta at a campo outside the accessible establishment ids", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [farmAGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo A" })
      .returning();
    const [farmA] = await testDb
      .insert(establishment)
      .values({ farmId: farmAGroup.id, name: "Campo A" })
      .returning();
    const [farmBGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo B" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: farmBGroup.id, name: "Campo B" })
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
      .values({ userId: manager.id, farmId: farmAGroup.id });

    const [batchB] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "sale",
        establishmentId: farmB.id,
        animalCount: 1,
        createdBy: manager.id,
      })
      .returning();
    await seedSaleEvent(
      farmB.id,
      manager.id,
      batchB.id,
      "TAG006",
      "D999999",
      null,
      null,
      null,
      "2026-07-11",
    );

    expect(await findSaleBatchByGuideNumber("D999999", [farmA.id])).toBeNull();
    expect(await findSaleBatchByGuideNumber("D999999", "all")).not.toBeNull();
  });
});
