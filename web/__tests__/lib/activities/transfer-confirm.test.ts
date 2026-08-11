import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  farm,
  role,
  establishment,
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
  const [managerRole] = await testDb
    .insert(role)
    .values({ name: "manager" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
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
    .values({ userId: manager.id, farmId: seededFarmGroup.id });
  return { manager, seededFarm, seededFarmGroup };
}

describe("confirmTransferBatch", () => {
  it("creates a new animal, its tag history, and a transfer event", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [destinationPaddock] = await testDb
      .insert(paddock)
      .values({ establishmentId: seededFarm.id, name: "Potrero 1" })
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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: destinationPaddock.id,
      rows,
    });

    const [createdAnimal] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "AR000000000010"));
    expect(createdAnimal).toBeDefined();

    const events = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, createdAnimal.animalId));
    expect(events).toHaveLength(2);

    const transferEvent = events.find((e) => e.eventType === "transfer")!;
    const [transfer] = await testDb
      .select()
      .from(eventTransfer)
      .where(eq(eventTransfer.eventId, transferEvent.id));
    expect(transfer.destinationPaddockId).toBe(destinationPaddock.id);
    expect(transfer.originEstablishmentId).toBe(seededFarm.id);
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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "AR000000000014"));
    const retagEvents = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    const retagEvent = retagEvents.find((e) => e.eventType === "retag")!;
    expect(retagEvent).toBeDefined();

    const [retag] = await testDb
      .select()
      .from(eventRetag)
      .where(eq(eventRetag.eventId, retagEvent.id));
    expect(retag.oldTag).toBe("AR000000000014");
    expect(retag.newTag).toBe("AR000000000014");

    const stateResult = await testDb.execute<{ current_tag: string | null }>(
      sql`select current_tag from animal_current_state where animal_id = ${tagRow.animalId}`,
    );
    expect(stateResult.rows[0].current_tag).toBe("AR000000000014");
  });

  it("creates a self-recategorize event for a new animal with an initial category", async () => {
    const { manager, seededFarm, seededFarmGroup } = await seedManagerAndFarm();
    const [createdCategory] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Ternero" })
      .returning();
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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "AR000000000015"));
    const animalEvents = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    const recategorizeEvent = animalEvents.find(
      (e) => e.eventType === "recategorize",
    )!;
    expect(recategorizeEvent).toBeDefined();

    const [recategorize] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, recategorizeEvent.id));
    expect(recategorize.newCategoryId).toBe(createdCategory.id);

    const stateResult = await testDb.execute<{
      current_category_id: string | null;
    }>(
      sql`select current_category_id from animal_current_state where animal_id = ${tagRow.animalId}`,
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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "AR000000000016"));
    const animalEvents = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    expect(animalEvents.some((e) => e.eventType === "recategorize")).toBe(
      false,
    );
  });

  it("rejects a cross-establishment transfer from a manager not assigned to the destination establishment", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [otherFarm] = await testDb
      .insert(establishment)
      .values({ farmId: otherFarmGroup.id, name: "Campo Sur" })
      .returning();

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
        operatingEstablishmentId: seededFarm.id,
        destinationEstablishmentId: otherFarm.id,
        destinationPaddockId: null,
        rows,
      }),
    ).rejects.toThrow();
  });

  it("allows a cross-establishment transfer from a manager assigned to both farms", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [otherFarm] = await testDb
      .insert(establishment)
      .values({ farmId: otherFarmGroup.id, name: "Campo Sur" })
      .returning();
    await testDb
      .insert(userFarm)
      .values({ userId: manager.id, farmId: otherFarmGroup.id });

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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: otherFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [createdEventTransfer] = await testDb.select().from(eventTransfer);
    expect(createdEventTransfer.originEstablishmentId).toBe(seededFarm.id);
    expect(createdEventTransfer.destinationEstablishmentId).toBe(otherFarm.id);
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000012",
        eventDate: "2026-02-01",
        notes: null,
        status: "error",
        reason: "x",
      },
    ];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingEstablishmentId: seededFarm.id,
        destinationEstablishmentId: seededFarm.id,
        destinationPaddockId: null,
        rows,
      }),
    ).rejects.toThrow();

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });

  it("rejects a destination paddock that belongs to a different establishment", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [otherFarm] = await testDb
      .insert(establishment)
      .values({ farmId: otherFarmGroup.id, name: "Campo Sur" })
      .returning();
    const [wrongPaddock] = await testDb
      .insert(paddock)
      .values({ establishmentId: otherFarm.id, name: "Potrero Sur" })
      .returning();

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
        operatingEstablishmentId: seededFarm.id,
        destinationEstablishmentId: seededFarm.id,
        destinationPaddockId: wrongPaddock.id,
        rows,
      }),
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
        operatingEstablishmentId: seededFarm.id,
        destinationEstablishmentId: seededFarm.id,
        destinationPaddockId: null,
        rows,
      }),
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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "AR000000000018"));
    const events = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    const transferEvent = events.find((e) => e.eventType === "transfer")!;
    expect(transferEvent.notes).toBe("Cojera leve");
  });

  it("uses an explicit originEstablishmentId for a new animal instead of operatingEstablishmentId, when provided", async () => {
    const { manager } = await seedManagerAndFarm();
    const [originFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [originFarm] = await testDb
      .insert(establishment)
      .values({ farmId: originFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [destinationFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte 2" })
      .returning();
    const [destinationFarm] = await testDb
      .insert(establishment)
      .values({ farmId: destinationFarmGroup.id, name: "Campo Norte 2" })
      .returning();

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
      operatingEstablishmentId: destinationFarm.id,
      destinationEstablishmentId: destinationFarm.id,
      destinationPaddockId: null,
      originEstablishmentId: originFarm.id,
      guideNumber: "D838153",
      rows,
    });

    const [createdEventTransfer] = await testDb.select().from(eventTransfer);
    expect(createdEventTransfer.originEstablishmentId).toBe(originFarm.id);
    expect(createdEventTransfer.destinationEstablishmentId).toBe(destinationFarm.id);
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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
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
    expect(Buffer.from(createdBatch.guideFileData as Buffer)).toEqual(
      Buffer.from("%PDF-1.4 fake guide content"),
    );
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
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [createdBatch] = await testDb.select().from(batchOperation);
    expect(createdBatch.guideFileName).toBeNull();
    expect(createdBatch.guideMimeType).toBeNull();
    expect(createdBatch.guideFileData).toBeNull();
  });

  it("requires access to the explicit originEstablishmentId when it differs from destinationEstablishmentId", async () => {
    const { manager } = await seedManagerAndFarm();
    const [originFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [originFarm] = await testDb
      .insert(establishment)
      .values({ farmId: originFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [destinationFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte 2" })
      .returning();
    const [destinationFarm] = await testDb
      .insert(establishment)
      .values({ farmId: destinationFarmGroup.id, name: "Campo Norte 2" })
      .returning();
    // The manager operates at the destination establishment itself (operatingEstablishmentId ===
    // destinationEstablishmentId), so the pre-existing operatingEstablishmentId-vs-destinationEstablishmentId
    // check would no-op; only the explicit originEstablishmentId differing from the
    // destination — and the manager lacking access to it — should trigger the throw.
    await testDb
      .insert(userFarm)
      .values({ userId: manager.id, farmId: destinationFarmGroup.id });

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
        operatingEstablishmentId: destinationFarm.id,
        destinationEstablishmentId: destinationFarm.id,
        destinationPaddockId: null,
        originEstablishmentId: originFarm.id,
        rows,
      }),
    ).rejects.toThrow(
      "No tenés acceso a ambos campos para crear este traslado",
    );
  });

  it("allows the explicit originEstablishmentId to differ from destinationEstablishmentId when the manager is assigned to both", async () => {
    const { manager } = await seedManagerAndFarm();
    const [originFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [originFarm] = await testDb
      .insert(establishment)
      .values({ farmId: originFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [destinationFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte 2" })
      .returning();
    const [destinationFarm] = await testDb
      .insert(establishment)
      .values({ farmId: destinationFarmGroup.id, name: "Campo Norte 2" })
      .returning();
    await testDb.insert(userFarm).values([
      { userId: manager.id, farmId: destinationFarmGroup.id },
      { userId: manager.id, farmId: originFarmGroup.id },
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
      operatingEstablishmentId: destinationFarm.id,
      destinationEstablishmentId: destinationFarm.id,
      destinationPaddockId: null,
      originEstablishmentId: originFarm.id,
      rows,
    });

    const [createdEventTransfer] = await testDb
      .select()
      .from(eventTransfer)
      .where(eq(eventTransfer.originEstablishmentId, originFarm.id));
    expect(createdEventTransfer.destinationEstablishmentId).toBe(destinationFarm.id);
  });

  it("gap-fills breed and secondaryTag on an existing animal that has neither yet", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR000000000090" });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000090",
        eventDate: "2026-02-01",
        notes: null,
        breed: "Angus",
        secondaryTag: "CHIP-090",
        status: "existing",
        animalId: createdAnimal.id,
        currentEstablishmentId: seededFarm.id,
        currentPaddockId: null,
      },
    ];

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingEstablishmentId: seededFarm.id,
      destinationEstablishmentId: seededFarm.id,
      destinationPaddockId: null,
      rows,
    });

    const [updatedAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, createdAnimal.id));
    expect(updatedAnimal.breed).toBe("Angus");
    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, createdAnimal.id));
    expect(tagRow.secondaryTag).toBe("CHIP-090");
  });
});
