// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventSale,
  saleSettlement,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { linkSaleSettlement } = await import("@/lib/activities/sale-settlement");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerFarmAndSale(opts: {
  buyer: string | null;
  price: string | null;
  weightKg: string | null;
  guideNumber?: string;
}) {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "San Antonio" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });

  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "sale", farmId: seededFarm.id, animalCount: 1, createdBy: manager.id })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "858000064429766" });
  const [saleEvent] = await testDb
    .insert(event)
    .values({
      eventType: "sale",
      eventDate: "2026-07-11",
      animalId: createdAnimal.id,
      farmId: seededFarm.id,
      batchOperationId: batch.id,
      createdBy: manager.id,
    })
    .returning();
  await testDb.insert(eventSale).values({
    eventId: saleEvent.id,
    guideNumber: opts.guideNumber ?? "D963691",
    buyer: opts.buyer,
    price: opts.price,
    weightKg: opts.weightKg,
  });

  return { manager, seededFarm, batch, saleEvent };
}

describe("linkSaleSettlement", () => {
  it("stores the liquidación and backfills buyer/price/weightKg when they were blank", async () => {
    const { manager, batch, saleEvent } = await seedManagerFarmAndSale({ buyer: null, price: null, weightKg: null });

    await linkSaleSettlement({
      userId: manager.id,
      role: "manager",
      guideNumber: "D963691",
      frigorifico: "Cledinor S.A.",
      weighDate: "2026-07-11",
      totalAmount: "23396.21",
      weightKg: "255.52",
      pricePerKg: "5.2189",
      guideDocument: { fileName: "liquidacion.pdf", mimeType: "application/pdf", data: Buffer.from("fake-pdf") },
    });

    const [settlement] = await testDb.select().from(saleSettlement).where(eq(saleSettlement.batchOperationId, batch.id));
    expect(settlement.guideNumber).toBe("D963691");
    expect(settlement.totalAmount).toBe("23396.21");
    expect(settlement.fileData.toString()).toBe("fake-pdf");

    const [updatedSale] = await testDb.select().from(eventSale).where(eq(eventSale.eventId, saleEvent.id));
    expect(updatedSale.buyer).toBe("Cledinor S.A.");
    expect(updatedSale.price).toBe("5.2189");
    expect(updatedSale.weightKg).toBe("255.52");
  });

  it("does not overwrite buyer/price/weightKg that were already set", async () => {
    const { manager, saleEvent } = await seedManagerFarmAndSale({
      buyer: "Otro comprador",
      price: "9.99",
      weightKg: "300",
    });

    await linkSaleSettlement({
      userId: manager.id,
      role: "manager",
      guideNumber: "D963691",
      frigorifico: "Cledinor S.A.",
      weighDate: "2026-07-11",
      totalAmount: "23396.21",
      weightKg: "255.52",
      pricePerKg: "5.2189",
      guideDocument: { fileName: "liquidacion.pdf", mimeType: "application/pdf", data: Buffer.from("fake-pdf") },
    });

    const [updatedSale] = await testDb.select().from(eventSale).where(eq(eventSale.eventId, saleEvent.id));
    expect(updatedSale.buyer).toBe("Otro comprador");
    expect(updatedSale.price).toBe("9.99");
    expect(updatedSale.weightKg).toBe("300");
  });

  it("does not backfill price/weight when the parsed settlement had none (multi-category case)", async () => {
    const { manager, saleEvent } = await seedManagerFarmAndSale({ buyer: null, price: null, weightKg: null });

    await linkSaleSettlement({
      userId: manager.id,
      role: "manager",
      guideNumber: "D963691",
      frigorifico: "Cledinor S.A.",
      weighDate: "2026-07-11",
      totalAmount: "23396.21",
      weightKg: null,
      pricePerKg: null,
      guideDocument: { fileName: "liquidacion.pdf", mimeType: "application/pdf", data: Buffer.from("fake-pdf") },
    });

    const [updatedSale] = await testDb.select().from(eventSale).where(eq(eventSale.eventId, saleEvent.id));
    expect(updatedSale.buyer).toBe("Cledinor S.A.");
    expect(updatedSale.price).toBeNull();
    expect(updatedSale.weightKg).toBeNull();
  });

  it("rejects when no venta has that guide number", async () => {
    const { manager } = await seedManagerFarmAndSale({ buyer: null, price: null, weightKg: null });

    await expect(
      linkSaleSettlement({
        userId: manager.id,
        role: "manager",
        guideNumber: "D000000",
        frigorifico: "Cledinor S.A.",
        weighDate: "2026-07-11",
        totalAmount: "23396.21",
        weightKg: null,
        pricePerKg: null,
        guideDocument: { fileName: "liquidacion.pdf", mimeType: "application/pdf", data: Buffer.from("fake-pdf") },
      })
    ).rejects.toThrow("No se encontró ninguna venta");
  });

  it("rejects when the user has no access to the venta's farm", async () => {
    await seedManagerFarmAndSale({ buyer: null, price: null, weightKg: null });
    const [managerRole] = await testDb.select().from(role).where(eq(role.name, "manager"));
    const [outsider] = await testDb
      .insert(userAccount)
      .values({ name: "Outsider", email: "outsider@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();

    await expect(
      linkSaleSettlement({
        userId: outsider.id,
        role: "manager",
        guideNumber: "D963691",
        frigorifico: "Cledinor S.A.",
        weighDate: "2026-07-11",
        totalAmount: "23396.21",
        weightKg: null,
        pricePerKg: null,
        guideDocument: { fileName: "liquidacion.pdf", mimeType: "application/pdf", data: Buffer.from("fake-pdf") },
      })
    ).rejects.toThrow();
  });
});
