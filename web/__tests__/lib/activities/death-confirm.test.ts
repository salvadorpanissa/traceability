// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import { role, farm, userAccount, userFarm, animal, animalTagHistory, event, eventTransfer, eventDeath } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmDeathEvent } = await import("@/lib/activities/death");

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

// Mirrors how confirmHealthBatch/confirmSaleBatch place a brand-new animal:
// an animal only shows up in animal_current_state with a farm once it has
// a transfer event.
async function seedAliveAnimal(tag: string, farmId: string, createdBy: string) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });
  const [batch] = await testDb
    .insert((await import("@/db/schema")).batchOperation)
    .values({ eventType: "transfer", farmId, animalCount: 1, createdBy })
    .returning();
  const [placementEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      farmId,
      batchOperationId: batch.id,
      createdBy,
    })
    .returning();
  await testDb.insert(eventTransfer).values({
    eventId: placementEvent.id,
    originFarmId: farmId,
    destinationFarmId: farmId,
    originPaddockId: null,
    destinationPaddockId: null,
  });
  await refreshDerivedState();
  return createdAnimal;
}

async function currentStatusFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ status: string | null }>(
    sql`select status from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.status ?? null;
}

describe("confirmDeathEvent", () => {
  it("writes a death event with cause and flips animal_current_state.status to dead", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const createdAnimal = await seedAliveAnimal("AR000000000900", seededFarm.id, manager.id);

    await confirmDeathEvent({
      userId: manager.id,
      role: "manager",
      tag: "AR000000000900",
      eventDate: "2026-02-01",
      cause: "Timpanismo",
    });

    expect(await currentStatusFor(createdAnimal.id)).toBe("dead");

    const [deathEvent] = await testDb.select().from(event).where(sql`${event.animalId} = ${createdAnimal.id} and ${event.eventType} = 'death'`);
    expect(deathEvent).toBeDefined();
    const [deathRow] = await testDb.select().from(eventDeath).where(sql`${eventDeath.eventId} = ${deathEvent.id}`);
    expect(deathRow.cause).toBe("Timpanismo");
  });

  it("accepts a null cause", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAliveAnimal("AR000000000901", seededFarm.id, manager.id);

    await confirmDeathEvent({
      userId: manager.id,
      role: "manager",
      tag: "AR000000000901",
      eventDate: "2026-02-01",
      cause: null,
    });

    const [deathEvent] = await testDb.select().from(event).where(sql`${event.eventType} = 'death'`);
    const [deathRow] = await testDb.select().from(eventDeath).where(sql`${eventDeath.eventId} = ${deathEvent.id}`);
    expect(deathRow.cause).toBeNull();
  });

  it("rejects an unknown tag", async () => {
    const { manager } = await seedManagerAndFarm();

    await expect(
      confirmDeathEvent({ userId: manager.id, role: "manager", tag: "AR000000009999", eventDate: "2026-02-01", cause: null })
    ).rejects.toThrow("No se encontró esa caravana o no tenés acceso a su campo");
  });

  it("rejects a tag that belongs to a farm the manager doesn't have access to", async () => {
    const { manager } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    await seedAliveAnimal("AR000000000902", otherFarm.id, manager.id);

    await expect(
      confirmDeathEvent({ userId: manager.id, role: "manager", tag: "AR000000000902", eventDate: "2026-02-01", cause: null })
    ).rejects.toThrow("No se encontró esa caravana o no tenés acceso a su campo");
  });

  it("refuses to double-register a death for an already-dead animal", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAliveAnimal("AR000000000903", seededFarm.id, manager.id);
    await confirmDeathEvent({ userId: manager.id, role: "manager", tag: "AR000000000903", eventDate: "2026-02-01", cause: null });

    await expect(
      confirmDeathEvent({ userId: manager.id, role: "manager", tag: "AR000000000903", eventDate: "2026-02-05", cause: null })
    ).rejects.toThrow("La caravana ya está registrada como muerta");
  });

  it("refuses to register a death for a sold animal", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const createdAnimal = await seedAliveAnimal("AR000000000904", seededFarm.id, manager.id);
    const { batchOperation, eventSale } = await import("@/db/schema");
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "sale", farmId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [saleEvent] = await testDb
      .insert(event)
      .values({ eventType: "sale", eventDate: "2026-01-15", animalId: createdAnimal.id, farmId: seededFarm.id, batchOperationId: batch.id, createdBy: manager.id })
      .returning();
    await testDb.insert(eventSale).values({ eventId: saleEvent.id, buyer: null, price: null, weightKg: null, guideNumber: null });
    await refreshDerivedState();

    await expect(
      confirmDeathEvent({ userId: manager.id, role: "manager", tag: "AR000000000904", eventDate: "2026-02-01", cause: null })
    ).rejects.toThrow("La caravana ya está registrada como vendida");
  });
});
