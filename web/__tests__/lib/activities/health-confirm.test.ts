import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  userFarm,
  product,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventHealth,
} from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";
import type { HealthProduct } from "@/lib/activities/health";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmHealthBatch } = await import("@/lib/activities/health");

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

describe("confirmHealthBatch", () => {
  it("creates one health event per product for a new animal, plus one placement transfer", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [productB] = await testDb.insert(product).values({ name: "Aftosa" }).returning();

    const rows: ResolvedRow[] = [{ tag: "AR000000000070", eventDate: "2026-02-01", status: "new", categoryId: null }];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: 21, notes: null },
      { productId: productB.id, dose: "2", doseUnit: "ml", route: "intramuscular", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000070"));
    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, tagRow.animalId));

    expect(animalEvents.filter((e) => e.eventType === "health")).toHaveLength(2);
    expect(animalEvents.filter((e) => e.eventType === "transfer")).toHaveLength(1);
    expect(animalEvents.filter((e) => e.eventType === "retag")).toHaveLength(1);

    const transferEvent = animalEvents.find((e) => e.eventType === "transfer")!;
    const [transfer] = await testDb.select().from(eventTransfer).where(eq(eventTransfer.eventId, transferEvent.id));
    expect(transfer.originFarmId).toBe(seededFarm.id);
    expect(transfer.destinationFarmId).toBe(seededFarm.id);
    expect(transfer.destinationPaddockId).toBeNull();

    const healthEvents = animalEvents.filter((e) => e.eventType === "health");
    const healthRows = await Promise.all(
      healthEvents.map(async (e) => {
        const [row] = await testDb.select().from(eventHealth).where(eq(eventHealth.eventId, e.id));
        return row;
      })
    );
    expect(healthRows.map((r) => r.productId).sort()).toEqual([productA.id, productB.id].sort());
  });

  it("does not create a placement transfer for an existing animal", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000071" });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000071",
        eventDate: "2026-02-01",
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents).toHaveLength(1);
    expect(animalEvents[0].eventType).toBe("health");
  });

  it("rejects an empty product list", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [{ tag: "AR000000000072", eventDate: "2026-02-01", status: "new", categoryId: null }];

    await expect(
      confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products: [], rows })
    ).rejects.toThrow();
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const rows: ResolvedRow[] = [{ tag: "AR000000000073", eventDate: "2026-02-01", status: "error", reason: "x" }];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await expect(
      confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows })
    ).rejects.toThrow();

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });
});
