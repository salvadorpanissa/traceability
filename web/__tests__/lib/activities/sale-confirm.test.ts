// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  event,
  eventSale,
  eventTransfer,
  product,
} from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmSaleBatch } = await import("@/lib/activities/sale");

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
  return { manager, seededFarm };
}

async function currentStatusFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ status: string | null }>(
    sql`select status from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.status ?? null;
}

describe("confirmSaleBatch", () => {
  it("creates a sale event with guideNumber/buyer/price/weightKg for a new animal, plus its placement traslado", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000200",
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

    await confirmSaleBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      guideNumber: "D963691",
      buyer: "Cledinor S.A.",
      price: "5.27",
      weightKg: "260",
      rows,
      forcedWithdrawalTags: [],
    });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000200"));
    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, tagRow.animalId));
    expect(animalEvents.filter((e) => e.eventType === "sale")).toHaveLength(1);
    expect(animalEvents.filter((e) => e.eventType === "transfer")).toHaveLength(1);

    const saleEvent = animalEvents.find((e) => e.eventType === "sale")!;
    const [saleRow] = await testDb.select().from(eventSale).where(eq(eventSale.eventId, saleEvent.id));
    expect(saleRow.guideNumber).toBe("D963691");
    expect(saleRow.buyer).toBe("Cledinor S.A.");
    expect(saleRow.price).toBe("5.27");
    expect(saleRow.weightKg).toBe("260");

    expect(await currentStatusFor(tagRow.animalId)).toBe("sold");
  });

  it("does not create a placement traslado for an existing animal", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000201" });
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000201",
        eventDate: "2026-02-01",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];

    await confirmSaleBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      guideNumber: "D963692",
      buyer: null,
      price: null,
      weightKg: null,
      rows,
      forcedWithdrawalTags: [],
    });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents).toHaveLength(1);
    expect(animalEvents[0].eventType).toBe("sale");
  });

  it("stores null buyer/price/weightKg when omitted", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000202" });
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000202",
        eventDate: "2026-02-01",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];

    await confirmSaleBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      guideNumber: "D963693",
      buyer: null,
      price: null,
      weightKg: null,
      rows,
      forcedWithdrawalTags: [],
    });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    const [saleRow] = await testDb.select().from(eventSale).where(eq(eventSale.eventId, animalEvents[0].id));
    expect(saleRow.buyer).toBeNull();
    expect(saleRow.price).toBeNull();
    expect(saleRow.weightKg).toBeNull();
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [{ tag: "AR000000000203", eventDate: "2026-02-01", notes: null, status: "error", reason: "x" }];

    await expect(
      confirmSaleBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        guideNumber: "D963694",
        buyer: null,
        price: null,
        weightKg: null,
        rows,
        forcedWithdrawalTags: [],
      })
    ).rejects.toThrow();
  });

  it("rejects confirmation when a new row has a pending owner", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000204",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        birthDate: null,
        ownerId: null,
        pendingOwnerName: "Gómez",
      },
    ];

    await expect(
      confirmSaleBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        guideNumber: "D963695",
        buyer: null,
        price: null,
        weightKg: null,
        rows,
        forcedWithdrawalTags: [],
      })
    ).rejects.toThrow("propietarios pendientes");
  });

  it("rejects the sale when an existing animal has a pending withdrawal not in forcedWithdrawalTags", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000205" });
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const { batchOperation, eventHealth } = await import("@/db/schema");
    const [healthBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "health", farmId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [healthEvent] = await testDb
      .insert(event)
      .values({
        eventType: "health",
        eventDate: "2026-02-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: healthBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb
      .insert(eventHealth)
      .values({ eventId: healthEvent.id, productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: 21 });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000205",
        eventDate: "2026-02-10",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];

    await expect(
      confirmSaleBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        guideNumber: "D963696",
        buyer: null,
        price: null,
        weightKg: null,
        rows,
        forcedWithdrawalTags: [],
      })
    ).rejects.toThrow();

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents.filter((e) => e.eventType === "sale")).toHaveLength(0);
  });

  it("confirms the sale when the pending withdrawal's tag is in forcedWithdrawalTags", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000206" });
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const { batchOperation, eventHealth } = await import("@/db/schema");
    const [healthBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "health", farmId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [healthEvent] = await testDb
      .insert(event)
      .values({
        eventType: "health",
        eventDate: "2026-02-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: healthBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb
      .insert(eventHealth)
      .values({ eventId: healthEvent.id, productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: 21 });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000206",
        eventDate: "2026-02-10",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];

    await confirmSaleBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      guideNumber: "D963697",
      buyer: null,
      price: null,
      weightKg: null,
      rows,
      forcedWithdrawalTags: ["AR000000000206"],
    });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents.filter((e) => e.eventType === "sale")).toHaveLength(1);
  });

  it("rejects the batch when an existing row's animal is currently at another farm", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000208" });
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000208",
        eventDate: "2026-02-01",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: otherFarm.id,
        currentPaddockId: null,
      },
    ];

    await expect(
      confirmSaleBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        guideNumber: "D963699",
        buyer: null,
        price: null,
        weightKg: null,
        rows,
        forcedWithdrawalTags: [],
      })
    ).rejects.toThrow("figura en otro campo");

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents).toHaveLength(0);
  });

  it("stores the guide PDF on the batch operation", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000207" });
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000207",
        eventDate: "2026-02-01",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];

    await confirmSaleBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      guideNumber: "D963698",
      buyer: null,
      price: null,
      weightKg: null,
      rows,
      forcedWithdrawalTags: [],
      guideDocument: { fileName: "guia.pdf", mimeType: "application/pdf", data: Buffer.from("fake-pdf") },
    });

    const { batchOperation } = await import("@/db/schema");
    const [batch] = await testDb.select().from(batchOperation).where(eq(batchOperation.eventType, "sale"));
    expect(batch.guideFileName).toBe("guia.pdf");
    expect(batch.guideFileData?.toString()).toBe("fake-pdf");
  });
});
