import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../test/db";
import { resetTestDb } from "../test/reset-db";
import { refreshDerivedState } from "../test/refresh-derived-state";
import {
  farm,
  role,
  establishment,
  userAccount,
  animal,
  batchOperation,
  event,
  eventTransfer,
} from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function currentEstablishmentIdFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_establishment_id: string | null }>(
    sql`select current_establishment_id from animal_current_state where animal_id = ${animalId}`,
  );
  return result.rows[0]?.current_establishment_id ?? null;
}

describe("animal_current_state", () => {
  it("reflects the transfer destination establishment after insert, and excludes voided transfers", async () => {
    const [adminRole] = await testDb
      .insert(role)
      .values({ name: "admin" })
      .returning();
    const [farmNorteGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [farmNorte] = await testDb
      .insert(establishment)
      .values({ farmId: farmNorteGroup.id, name: "Campo Norte" })
      .returning();
    const [farmSurGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [farmSur] = await testDb
      .insert(establishment)
      .values({ farmId: farmSurGroup.id, name: "Campo Sur" })
      .returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({
        name: "Admin",
        email: "admin@example.com",
        passwordHash: "hashed",
        roleId: adminRole.id,
      })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    const [batch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        establishmentId: farmNorte.id,
        animalCount: 1,
        createdBy: user.id,
      })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        establishmentId: farmNorte.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({
        eventId: transferEvent.id,
        originEstablishmentId: farmNorte.id,
        destinationEstablishmentId: farmSur.id,
      });
    await refreshDerivedState();

    expect(await currentEstablishmentIdFor(createdAnimal.id)).toBe(farmSur.id);

    // Void the transfer and confirm the animal falls back to "no current establishment".
    const [voidBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "void",
        establishmentId: farmNorte.id,
        animalCount: 1,
        createdBy: user.id,
      })
      .returning();
    await testDb.insert(event).values({
      eventType: "void",
      eventDate: "2026-01-02",
      animalId: createdAnimal.id,
      establishmentId: farmNorte.id,
      batchOperationId: voidBatch.id,
      createdBy: user.id,
      voidsEventId: transferEvent.id,
    });
    await refreshDerivedState();

    expect(await currentEstablishmentIdFor(createdAnimal.id)).toBeNull();

    const remainingTransferEvents = await testDb.execute(
      sql`select count(*) as count from event where event_type = 'transfer'`,
    );
    expect(Number(remainingTransferEvents.rows[0].count)).toBe(1);
  });
});
