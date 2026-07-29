import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
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
  paddock,
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

async function currentPaddockIdFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_paddock_id: string | null }>(
    sql`select current_paddock_id from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.current_paddock_id ?? null;
}

describe("confirmHealthBatch", () => {
  it("creates one health event per product for a new animal, plus one placement transfer", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [productB] = await testDb.insert(product).values({ name: "Aftosa" }).returning();

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000070",
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
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: 21, notes: null },
      { productId: productB.id, dose: "2", doseUnit: "ml", route: "intramuscular", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows, paddockId: null });

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
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows, paddockId: null });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents).toHaveLength(1);
    expect(animalEvents[0].eventType).toBe("health");
  });

  it("gap-fills breed and secondaryTag on an existing animal that has neither yet", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000081" });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000081",
        eventDate: "2026-02-01",
        notes: null,
        breed: "Angus",
        secondaryTag: "CHIP-081",
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows, paddockId: null });

    const [updatedAnimal] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(updatedAnimal.breed).toBe("Angus");
    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.animalId, createdAnimal.id));
    expect(tagRow.secondaryTag).toBe("CHIP-081");
  });

  it("does not overwrite an existing animal's breed", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({ breed: "Hereford" }).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000082" });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000082",
        eventDate: "2026-02-01",
        notes: null,
        breed: "Angus",
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows, paddockId: null });

    const [updatedAnimal] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(updatedAnimal.breed).toBe("Hereford");
  });

  it("rejects an empty product list", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000072",
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

    await expect(
      confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products: [], rows, paddockId: null })
    ).rejects.toThrow();
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const rows: ResolvedRow[] = [{ tag: "AR000000000073", eventDate: "2026-02-01", notes: null, status: "error", reason: "x" }];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await expect(
      confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows, paddockId: null })
    ).rejects.toThrow();

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });

  it("rejects confirmation when a new row has a pending owner", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000074",
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
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await expect(
      confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows, paddockId: null })
    ).rejects.toThrow("propietarios pendientes");
  });

  it("persists the row's notes on every health event created for that row", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [productB] = await testDb.insert(product).values({ name: "Aftosa" }).returning();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000075",
        eventDate: "2026-02-01",
        notes: "Animal nervioso",
        status: "new",
        categoryId: null,
        sex: null,
        birthDate: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
      { productId: productB.id, dose: "2", doseUnit: "ml", route: "intramuscular", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows, paddockId: null });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000075"));
    const healthEvents = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    const notes = healthEvents.filter((e) => e.eventType === "health").map((e) => e.notes);
    expect(notes).toEqual(["Animal nervioso", "Animal nervioso"]);
  });

  it("stores the chosen paddock on every health event created for the batch", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [createdPaddock] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero 1" }).returning();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000076",
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
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      products,
      rows,
      paddockId: createdPaddock.id,
    });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000076"));
    const healthEvent = (await testDb.select().from(event).where(eq(event.animalId, tagRow.animalId))).find(
      (e) => e.eventType === "health"
    )!;
    const [healthRow] = await testDb.select().from(eventHealth).where(eq(eventHealth.eventId, healthEvent.id));
    expect(healthRow.paddockId).toBe(createdPaddock.id);
  });

  it("rejects a paddock that belongs to a different farm", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [foreignPaddock] = await testDb.insert(paddock).values({ farmId: otherFarm.id, name: "Potrero Ajeno" }).returning();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000077",
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
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await expect(
      confirmHealthBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        products,
        rows,
        paddockId: foreignPaddock.id,
      })
    ).rejects.toThrow("El potrero no pertenece al campo activo");
  });

  it("creates a same-farm traslado for an existing animal whose current potrero differs, when transferMismatchedToPaddock is true", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [potreroA] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero A" }).returning();
    const [potreroB] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero B" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000078" });

    // The animal's real placement in potrero B is *more recent* than the
    // (backdated) sanidad. The traslado must still win in animal_current_state.
    const [seedBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [seedTransferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-06-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: seedBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb.insert(eventTransfer).values({
      eventId: seedTransferEvent.id,
      originFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      originPaddockId: null,
      destinationPaddockId: potreroB.id,
    });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000078",
        eventDate: "2026-02-01",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: potreroB.id,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      products,
      rows,
      paddockId: potreroA.id,
      transferMismatchedToPaddock: true,
    });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents.filter((e) => e.eventType === "health")).toHaveLength(1);
    const transferEvent = animalEvents.find((e) => e.eventType === "transfer" && e.id !== seedTransferEvent.id);
    expect(transferEvent).toBeDefined();

    const [transfer] = await testDb.select().from(eventTransfer).where(eq(eventTransfer.eventId, transferEvent!.id));
    expect(transfer.originFarmId).toBe(seededFarm.id);
    expect(transfer.destinationFarmId).toBe(seededFarm.id);
    expect(transfer.originPaddockId).toBe(potreroB.id);
    expect(transfer.destinationPaddockId).toBe(potreroA.id);

    // The traslado is dated "now" so it wins over the animal's later real
    // transfer — otherwise the relocation would be a silent no-op.
    expect(transferEvent!.eventDate).toBe(new Date().toISOString().slice(0, 10));
    expect(await currentPaddockIdFor(createdAnimal.id)).toBe(potreroA.id);
  });

  it("does not create a traslado for an animal currently at a different farm, even when transferMismatchedToPaddock is true", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [potreroA] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero A" }).returning();
    const [potreroAjeno] = await testDb.insert(paddock).values({ farmId: otherFarm.id, name: "Potrero Ajeno" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000080" });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000080",
        eventDate: "2026-02-01",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: otherFarm.id,
        currentPaddockId: potreroAjeno.id,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      products,
      rows,
      paddockId: potreroA.id,
      transferMismatchedToPaddock: true,
    });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents.filter((e) => e.eventType === "transfer")).toHaveLength(0);
    expect(animalEvents).toHaveLength(1);
    expect(animalEvents[0].eventType).toBe("health");
  });

  it("does not create a traslado for a mismatched animal when transferMismatchedToPaddock is false", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [potreroA] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero A" }).returning();
    const [potreroB] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero B" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000079" });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000079",
        eventDate: "2026-02-01",
        notes: null,
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: potreroB.id,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      products,
      rows,
      paddockId: potreroA.id,
    });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents).toHaveLength(1);
    expect(animalEvents[0].eventType).toBe("health");
  });
});
