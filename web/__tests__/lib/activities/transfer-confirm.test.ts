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
        birthDate: null,
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
        birthDate: null,
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
        birthDate: null,
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
        birthDate: null,
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

  it("rejects a cross-farm transfer from a manager not assigned to the destination farm", async () => {
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
        birthDate: null,
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

  it("allows a cross-farm transfer from a manager assigned to both farms", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: otherFarm.id });

    const rows: ResolvedRow[] = [
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

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: otherFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [createdEventTransfer] = await testDb.select().from(eventTransfer);
    expect(createdEventTransfer.originFarmId).toBe(seededFarm.id);
    expect(createdEventTransfer.destinationFarmId).toBe(otherFarm.id);
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
        birthDate: null,
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
        birthDate: null,
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

  it("persists the row's notes on the transfer event", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000018",
        eventDate: "2026-02-01",
        notes: "Cojera leve",
        status: "new",
        categoryId: null,
        sex: null,
        birthDate: null,
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

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000018"));
    const events = await testDb.select().from(event).where(eq(event.animalId, tagRow.animalId));
    const transferEvent = events.find((e) => e.eventType === "transfer")!;
    expect(transferEvent.notes).toBe("Cojera leve");
  });

  it("uses an explicit originFarmId for a new animal instead of operatingFarmId, when provided", async () => {
    const { manager } = await seedManagerAndFarm();
    const [originFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [destinationFarm] = await testDb.insert(farm).values({ name: "Campo Norte 2" }).returning();

    const rows: ResolvedRow[] = [
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

    await confirmTransferBatch({
      userId: manager.id,
      role: "admin",
      operatingFarmId: destinationFarm.id,
      destinationFarmId: destinationFarm.id,
      destinationPaddockId: null,
      originFarmId: originFarm.id,
      guideNumber: "D838153",
      rows,
    });

    const [createdEventTransfer] = await testDb.select().from(eventTransfer);
    expect(createdEventTransfer.originFarmId).toBe(originFarm.id);
    expect(createdEventTransfer.destinationFarmId).toBe(destinationFarm.id);
    expect(createdEventTransfer.guideNumber).toBe("D838153");
  });

  it("persists the uploaded guide document on the batch when provided", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();

    const rows: ResolvedRow[] = [
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

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      guideDocument: {
        fileName: "D838153.pdf",
        mimeType: "application/pdf",
        data: Buffer.from("%PDF-1.4 fake guide content"),
      },
      rows,
    });

    const [createdBatch] = await testDb.select().from(batchOperation);
    expect(createdBatch.guideFileName).toBe("D838153.pdf");
    expect(createdBatch.guideMimeType).toBe("application/pdf");
    expect(Buffer.from(createdBatch.guideFileData as Buffer)).toEqual(Buffer.from("%PDF-1.4 fake guide content"));
  });

  it("leaves the guide document columns null for a batch with no guideDocument (the Excel path)", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();

    const rows: ResolvedRow[] = [
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

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [createdBatch] = await testDb.select().from(batchOperation);
    expect(createdBatch.guideFileName).toBeNull();
    expect(createdBatch.guideMimeType).toBeNull();
    expect(createdBatch.guideFileData).toBeNull();
  });

  it("requires access to the explicit originFarmId when it differs from destinationFarmId", async () => {
    const { manager } = await seedManagerAndFarm();
    const [originFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [destinationFarm] = await testDb.insert(farm).values({ name: "Campo Norte 2" }).returning();
    // The manager operates at the destination farm itself (operatingFarmId ===
    // destinationFarmId), so the pre-existing operatingFarmId-vs-destinationFarmId
    // check would no-op; only the explicit originFarmId differing from the
    // destination — and the manager lacking access to it — should trigger the throw.
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: destinationFarm.id });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000012",
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
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: destinationFarm.id,
        destinationFarmId: destinationFarm.id,
        destinationPaddockId: null,
        originFarmId: originFarm.id,
        rows,
      })
    ).rejects.toThrow("No tenés acceso a ambos campos para crear este traslado");
  });

  it("allows the explicit originFarmId to differ from destinationFarmId when the manager is assigned to both", async () => {
    const { manager } = await seedManagerAndFarm();
    const [originFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [destinationFarm] = await testDb.insert(farm).values({ name: "Campo Norte 2" }).returning();
    await testDb.insert(userFarm).values([
      { userId: manager.id, farmId: destinationFarm.id },
      { userId: manager.id, farmId: originFarm.id },
    ]);

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000013",
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

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: destinationFarm.id,
      destinationFarmId: destinationFarm.id,
      destinationPaddockId: null,
      originFarmId: originFarm.id,
      rows,
    });

    const [createdEventTransfer] = await testDb
      .select()
      .from(eventTransfer)
      .where(eq(eventTransfer.originFarmId, originFarm.id));
    expect(createdEventTransfer.destinationFarmId).toBe(destinationFarm.id);
  });
});
