// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import { farm, role, establishment, userAccount, userFarm, animal, animalTagHistory, event, eventTransfer } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmRetagEvent } = await import("@/lib/activities/retag");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [seededFarm] = await testDb.insert(establishment).values({ farmId: seededFarmGroup.id, name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });
  return { manager, seededFarm };
}

async function seedAliveAnimal(tag: string, establishmentId: string, createdBy: string, secondaryTag?: string) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag, secondaryTag: secondaryTag ?? null });
  const [batch] = await testDb
    .insert((await import("@/db/schema")).batchOperation)
    .values({ eventType: "transfer", establishmentId, animalCount: 1, createdBy })
    .returning();
  const [placementEvent] = await testDb
    .insert(event)
    .values({ eventType: "transfer", eventDate: "2026-01-01", animalId: createdAnimal.id, establishmentId, batchOperationId: batch.id, createdBy })
    .returning();
  await testDb.insert(eventTransfer).values({
    eventId: placementEvent.id,
    originEstablishmentId: establishmentId,
    destinationEstablishmentId: establishmentId,
    originPaddockId: null,
    destinationPaddockId: null,
  });
  await refreshDerivedState();
  return createdAnimal;
}

async function currentTagFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_tag: string | null }>(sql`select current_tag from animal_current_state where animal_id = ${animalId}`);
  return result.rows[0]?.current_tag ?? null;
}

describe("confirmRetagEvent", () => {
  it("replaces the tag, writes a retag event, and updates animal_current_state.current_tag", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const createdAnimal = await seedAliveAnimal("AR000000001000", seededFarm.id, manager.id);

    await confirmRetagEvent({
      userId: manager.id,
      role: "manager",
      tag: "AR000000001000",
      newTag: "AR000000001999",
      eventDate: "2026-02-01",
    });

    expect(await currentTagFor(createdAnimal.id)).toBe("AR000000001999");

    const [retagEvent] = await testDb
      .select()
      .from(event)
      .where(sql`${event.animalId} = ${createdAnimal.id} and ${event.eventType} = 'retag'`);
    expect(retagEvent).toBeDefined();

    const { eventRetag } = await import("@/db/schema");
    const [retagRow] = await testDb.select().from(eventRetag).where(sql`${eventRetag.eventId} = ${retagEvent.id}`);
    expect(retagRow.oldTag).toBe("AR000000001000");
    expect(retagRow.newTag).toBe("AR000000001999");
  });

  it("carries the secondary tag forward onto the new tag row without duplicating it", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const createdAnimal = await seedAliveAnimal("AR000000001001", seededFarm.id, manager.id, "CHIP-001");

    await confirmRetagEvent({
      userId: manager.id,
      role: "manager",
      tag: "AR000000001001",
      newTag: "AR000000001998",
      eventDate: "2026-02-01",
    });

    const rows = await testDb
      .select({ tag: animalTagHistory.tag, secondaryTag: animalTagHistory.secondaryTag })
      .from(animalTagHistory)
      .where(sql`${animalTagHistory.animalId} = ${createdAnimal.id}`)
      .orderBy(animalTagHistory.validFrom);

    expect(rows).toEqual([
      { tag: "AR000000001001", secondaryTag: null },
      { tag: "AR000000001998", secondaryTag: "CHIP-001" },
    ]);
  });

  it("rejects an unknown tag", async () => {
    const { manager } = await seedManagerAndFarm();

    await expect(
      confirmRetagEvent({ userId: manager.id, role: "manager", tag: "AR000000009999", newTag: "AR000000001997", eventDate: "2026-02-01" })
    ).rejects.toThrow("No se encontró esa caravana o no tenés acceso a su campo");
  });

  it("rejects a tag that belongs to a establishment the manager doesn't have access to", async () => {
    const { manager } = await seedManagerAndFarm();
    const [otherFarmGroup] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [otherFarm] = await testDb.insert(establishment).values({ farmId: otherFarmGroup.id, name: "Cuatro Cerros" }).returning();
    await seedAliveAnimal("AR000000001002", otherFarm.id, manager.id);

    await expect(
      confirmRetagEvent({ userId: manager.id, role: "manager", tag: "AR000000001002", newTag: "AR000000001996", eventDate: "2026-02-01" })
    ).rejects.toThrow("No se encontró esa caravana o no tenés acceso a su campo");
  });

  it("refuses to retag an animal already registered as dead", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const createdAnimal = await seedAliveAnimal("AR000000001003", seededFarm.id, manager.id);
    const { batchOperation, eventDeath } = await import("@/db/schema");
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "death", establishmentId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [deathEvent] = await testDb
      .insert(event)
      .values({ eventType: "death", eventDate: "2026-01-15", animalId: createdAnimal.id, establishmentId: seededFarm.id, batchOperationId: batch.id, createdBy: manager.id })
      .returning();
    await testDb.insert(eventDeath).values({ eventId: deathEvent.id, cause: null });
    await refreshDerivedState();

    await expect(
      confirmRetagEvent({ userId: manager.id, role: "manager", tag: "AR000000001003", newTag: "AR000000001995", eventDate: "2026-02-01" })
    ).rejects.toThrow("La caravana ya está registrada como muerta");
  });

  it("rejects a new tag that's already in use by another animal", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAliveAnimal("AR000000001004", seededFarm.id, manager.id);
    await seedAliveAnimal("AR000000001005", seededFarm.id, manager.id);

    await expect(
      confirmRetagEvent({ userId: manager.id, role: "manager", tag: "AR000000001004", newTag: "AR000000001005", eventDate: "2026-02-01" })
    ).rejects.toThrow("Esa caravana ya está en uso");
  });
});
