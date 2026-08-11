// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  farm,
  role,
  establishment,
  userAccount,
  animal,
  batchOperation,
  event,
  eventHealth,
  product,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { findPendingWithdrawals } = await import("@/lib/dal/health-withdrawal");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmUserAnimal() {
  const [adminRole] = await testDb
    .insert(role)
    .values({ name: "admin" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
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
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  const [batch] = await testDb
    .insert(batchOperation)
    .values({
      eventType: "health",
      establishmentId: seededFarm.id,
      animalCount: 1,
      createdBy: user.id,
    })
    .returning();
  return { seededFarm, seededFarmGroup, user, createdAnimal, batch };
}

async function seedHealthEvent(
  animalId: string,
  establishmentId: string,
  batchId: string,
  userId: string,
  productId: string,
  eventDate: string,
  withdrawalDays: number | null,
  voided = false,
) {
  const [healthEvent] = await testDb
    .insert(event)
    .values({
      eventType: "health",
      eventDate,
      animalId,
      establishmentId,
      batchOperationId: batchId,
      createdBy: userId,
    })
    .returning();
  await testDb.insert(eventHealth).values({
    eventId: healthEvent.id,
    productId,
    dose: "10",
    doseUnit: "ml",
    route: "subcutánea",
    withdrawalDays,
  });
  if (voided) {
    await testDb.insert(event).values({
      eventType: "void",
      eventDate,
      animalId,
      establishmentId,
      batchOperationId: batchId,
      createdBy: userId,
      voidsEventId: healthEvent.id,
    });
  }
  return healthEvent;
}

describe("findPendingWithdrawals", () => {
  it("flags an animal whose withdrawal period has not elapsed by the given date", async () => {
    const { seededFarm, seededFarmGroup, user, createdAnimal, batch } =
      await seedFarmUserAnimal();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();
    await seedHealthEvent(
      createdAnimal.id,
      seededFarm.id,
      batch.id,
      user.id,
      productA.id,
      "2026-02-01",
      21,
    );

    const result = await findPendingWithdrawals(
      [createdAnimal.id],
      "2026-02-10",
    );

    expect(result).toEqual([
      {
        animalId: createdAnimal.id,
        productName: "Ivermectina 1%",
        restrictionEndDate: "2026-02-22",
      },
    ]);
  });

  it("does not flag an animal whose withdrawal period already elapsed by the given date", async () => {
    const { seededFarm, seededFarmGroup, user, createdAnimal, batch } =
      await seedFarmUserAnimal();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();
    await seedHealthEvent(
      createdAnimal.id,
      seededFarm.id,
      batch.id,
      user.id,
      productA.id,
      "2026-02-01",
      21,
    );

    const result = await findPendingWithdrawals(
      [createdAnimal.id],
      "2026-03-01",
    );

    expect(result).toEqual([]);
  });

  it("does not flag a health event with no withdrawal days set", async () => {
    const { seededFarm, seededFarmGroup, user, createdAnimal, batch } =
      await seedFarmUserAnimal();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Vitamina" })
      .returning();
    await seedHealthEvent(
      createdAnimal.id,
      seededFarm.id,
      batch.id,
      user.id,
      productA.id,
      "2026-02-01",
      null,
    );

    const result = await findPendingWithdrawals(
      [createdAnimal.id],
      "2026-02-02",
    );

    expect(result).toEqual([]);
  });

  it("does not flag a voided health event", async () => {
    const { seededFarm, seededFarmGroup, user, createdAnimal, batch } =
      await seedFarmUserAnimal();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();
    await seedHealthEvent(
      createdAnimal.id,
      seededFarm.id,
      batch.id,
      user.id,
      productA.id,
      "2026-02-01",
      21,
      true,
    );

    const result = await findPendingWithdrawals(
      [createdAnimal.id],
      "2026-02-10",
    );

    expect(result).toEqual([]);
  });

  it("returns one entry per active withdrawal when an animal has more than one pending", async () => {
    const { seededFarm, seededFarmGroup, user, createdAnimal, batch } =
      await seedFarmUserAnimal();
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();
    const [productB] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Aftosa" })
      .returning();
    await seedHealthEvent(
      createdAnimal.id,
      seededFarm.id,
      batch.id,
      user.id,
      productA.id,
      "2026-02-01",
      21,
    );
    await seedHealthEvent(
      createdAnimal.id,
      seededFarm.id,
      batch.id,
      user.id,
      productB.id,
      "2026-02-05",
      10,
    );

    const result = await findPendingWithdrawals(
      [createdAnimal.id],
      "2026-02-10",
    );

    expect(
      result.sort((a, b) => a.productName.localeCompare(b.productName)),
    ).toEqual([
      {
        animalId: createdAnimal.id,
        productName: "Aftosa",
        restrictionEndDate: "2026-02-15",
      },
      {
        animalId: createdAnimal.id,
        productName: "Ivermectina 1%",
        restrictionEndDate: "2026-02-22",
      },
    ]);
  });

  it("returns nothing for an empty animalIds list", async () => {
    const result = await findPendingWithdrawals([], "2026-02-10");
    expect(result).toEqual([]);
  });
});
