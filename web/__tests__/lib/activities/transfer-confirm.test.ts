import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  userFarm,
  paddock,
  category,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventRetag,
  eventRecategorize,
} from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/transfer";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmTransferBatch } = await import("@/lib/activities/transfer");

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

describe("confirmTransferBatch", () => {
  it("creates a new animal, its tag history, and a transfer event", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [destinationPaddock] = await testDb
      .insert(paddock)
      .values({ farmId: seededFarm.id, name: "Potrero 1" })
      .returning();

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000010",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: destinationPaddock.id,
      rows,
    });

    const [createdAnimal] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "AR000000000010"));
    expect(createdAnimal).toBeDefined();

    const events = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.animalId));
    expect(events).toHaveLength(2);

    const transferEvent = events.find((e) => e.eventType === "transfer")!;
    const [transfer] = await testDb.select().from(eventTransfer).where(eq(eventTransfer.eventId, transferEvent.id));
    expect(transfer.destinationPaddockId).toBe(destinationPaddock.id);
    expect(transfer.originFarmId).toBe(seededFarm.id);
  });

  it("creates a self-retag event for a new animal so current_tag is populated", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000014",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000014"));
    const retagEvents = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    const retagEvent = retagEvents.find((e) => e.eventType === "retag")!;
    expect(retagEvent).toBeDefined();

    const [retag] = await testDb.select().from(eventRetag).where(eq(eventRetag.eventId, retagEvent.id));
    expect(retag.oldTag).toBe("AR000000000014");
    expect(retag.newTag).toBe("AR000000000014");

    const stateResult = await testDb.execute<{ current_tag: string | null }>(
      sql`select current_tag from animal_current_state where animal_id = ${tagRow.animalId}`
    );
    expect(stateResult.rows[0].current_tag).toBe("AR000000000014");
  });

  it("creates a self-recategorize event for a new animal with an initial category", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdCategory] = await testDb.insert(category).values({ name: "Ternero" }).returning();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000015",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: createdCategory.id,
        sex: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000015"));
    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, tagRow.animalId));
    const recategorizeEvent = animalEvents.find((e) => e.eventType === "recategorize")!;
    expect(recategorizeEvent).toBeDefined();

    const [recategorize] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, recategorizeEvent.id));
    expect(recategorize.newCategoryId).toBe(createdCategory.id);

    const stateResult = await testDb.execute<{ current_category_id: string | null }>(
      sql`select current_category_id from animal_current_state where animal_id = ${tagRow.animalId}`
    );
    expect(stateResult.rows[0].current_category_id).toBe(createdCategory.id);
  });

  it("does not create a recategorize event for a new animal without an initial category", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000016",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000016"));
    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, tagRow.animalId));
    expect(animalEvents.some((e) => e.eventType === "recategorize")).toBe(false);
  });

  it("rejects a cross-farm transfer from a manager", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000011",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        destinationFarmId: otherFarm.id,
        destinationPaddockId: null,
        rows,
      })
    ).rejects.toThrow();
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [{ tag: "AR000000000012", eventDate: "2026-02-01", notes: null, status: "error", reason: "x" }];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        destinationFarmId: seededFarm.id,
        destinationPaddockId: null,
        rows,
      })
    ).rejects.toThrow();

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });

  it("rejects a destination paddock that belongs to a different farm", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [wrongPaddock] = await testDb.insert(paddock).values({ farmId: otherFarm.id, name: "Potrero Sur" }).returning();

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000013",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        destinationFarmId: seededFarm.id,
        destinationPaddockId: wrongPaddock.id,
        rows,
      })
    ).rejects.toThrow();
  });

  it("rejects confirmation when a new row has a pending owner", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000017",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: "Gómez",
      },
    ];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        destinationFarmId: seededFarm.id,
        destinationPaddockId: null,
        rows,
      })
    ).rejects.toThrow("propietarios pendientes");
  });
});
