import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../test/db";
import { resetTestDb } from "../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event, eventTransfer, paddock } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function currentPaddockIdFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_paddock_id: string | null }>(
    sql`select current_paddock_id from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.current_paddock_id ?? null;
}

describe("animal_current_state.current_paddock_id", () => {
  it("reflects the destination paddock after a same-farm transfer, and stays null without one", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [potreroA] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero A" }).returning();
    const [potreroB] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero B" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();

    // Animal 1: transfer with paddocks specified.
    const [animalWithPaddock] = await testDb.insert(animal).values({}).returning();
    const [batch1] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [event1] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: animalWithPaddock.id,
        farmId: seededFarm.id,
        batchOperationId: batch1.id,
        createdBy: user.id,
      })
      .returning();
    await testDb.insert(eventTransfer).values({
      eventId: event1.id,
      originFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      originPaddockId: potreroA.id,
      destinationPaddockId: potreroB.id,
    });

    expect(await currentPaddockIdFor(animalWithPaddock.id)).toBe(potreroB.id);

    // Animal 2: transfer without a paddock specified.
    const [animalWithoutPaddock] = await testDb.insert(animal).values({}).returning();
    const [batch2] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [event2] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: animalWithoutPaddock.id,
        farmId: seededFarm.id,
        batchOperationId: batch2.id,
        createdBy: user.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: event2.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id });

    expect(await currentPaddockIdFor(animalWithoutPaddock.id)).toBeNull();
  });
});
