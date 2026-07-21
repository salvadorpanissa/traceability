import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../test/db";
import { resetTestDb } from "../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event, eventTransfer } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function currentFarmIdFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_farm_id: string | null }>(
    sql`select current_farm_id from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.current_farm_id ?? null;
}

describe("animal_current_state", () => {
  it("reflects the transfer destination farm after insert, and excludes voided transfers", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: farmNorte.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: farmNorte.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: transferEvent.id, originFarmId: farmNorte.id, destinationFarmId: farmSur.id });

    expect(await currentFarmIdFor(createdAnimal.id)).toBe(farmSur.id);

    // Void the transfer and confirm the animal falls back to "no current farm".
    const [voidBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "void", farmId: farmNorte.id, animalCount: 1, createdBy: user.id })
      .returning();
    await testDb.insert(event).values({
      eventType: "void",
      eventDate: "2026-01-02",
      animalId: createdAnimal.id,
      farmId: farmNorte.id,
      batchOperationId: voidBatch.id,
      createdBy: user.id,
      voidsEventId: transferEvent.id,
    });

    expect(await currentFarmIdFor(createdAnimal.id)).toBeNull();

    const remainingTransferEvents = await testDb.execute(
      sql`select count(*) as count from event where event_type = 'transfer'`
    );
    expect(Number(remainingTransferEvents.rows[0].count)).toBe(1);
  });
});
