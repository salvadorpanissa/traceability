import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  userFarm,
  paddock,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
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

    const rows: ResolvedRow[] = [{ tag: "AR000000000010", eventDate: "2026-02-01", status: "new", categoryId: null }];

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
    expect(events).toHaveLength(1);

    const [transfer] = await testDb.select().from(eventTransfer).where(eq(eventTransfer.eventId, events[0].id));
    expect(transfer.destinationPaddockId).toBe(destinationPaddock.id);
    expect(transfer.originFarmId).toBe(seededFarm.id);
  });

  it("rejects a cross-farm transfer from a manager", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();

    const rows: ResolvedRow[] = [{ tag: "AR000000000011", eventDate: "2026-02-01", status: "new", categoryId: null }];

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
    const rows: ResolvedRow[] = [{ tag: "AR000000000012", eventDate: "2026-02-01", status: "error", reason: "x" }];

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

    const rows: ResolvedRow[] = [{ tag: "AR000000000013", eventDate: "2026-02-01", status: "new", categoryId: null }];

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
});
