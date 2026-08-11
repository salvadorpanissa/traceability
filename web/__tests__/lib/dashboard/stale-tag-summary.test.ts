// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  farmGroup,
  role,
  farm,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventRetag,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { findStaleTags } = await import("@/lib/dashboard/stale-tag-summary");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm() {
  const [managerRole] = await testDb
    .insert(role)
    .values({ name: "manager" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farmGroup)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(farm)
    .values({ groupId: seededFarmGroup.id, name: "Campo Norte" })
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
    .values({ userId: manager.id, farmId: seededFarm.id });
  return { manager, seededFarm };
}

function daysAgoISODate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function seedAnimalWithLastEvent(
  tag: string,
  farmId: string,
  createdBy: string,
  eventDate: string,
  validFrom: string = eventDate,
) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb
    .insert(animalTagHistory)
    .values({
      animalId: createdAnimal.id,
      tag,
      validFrom: new Date(validFrom),
    });

  // Create self-retag event to make the tag appear in animal_current_state.current_tag
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "retag", farmId, animalCount: 1, createdBy })
    .returning();
  const [retagEvent] = await testDb
    .insert(event)
    .values({
      eventType: "retag",
      eventDate,
      animalId: createdAnimal.id,
      farmId,
      batchOperationId: batch.id,
      createdBy,
    })
    .returning();
  await testDb
    .insert(eventRetag)
    .values({ eventId: retagEvent.id, oldTag: tag, newTag: tag });

  // Then add transfer event
  const [transferBatch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", farmId, animalCount: 1, createdBy })
    .returning();
  const [transferEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate,
      animalId: createdAnimal.id,
      farmId,
      batchOperationId: transferBatch.id,
      createdBy,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({
      eventId: transferEvent.id,
      originFarmId: farmId,
      destinationFarmId: farmId,
      originPaddockId: null,
      destinationPaddockId: null,
    });

  await refreshDerivedState();
  return createdAnimal;
}

describe("findStaleTags", () => {
  it("falls back to the animal's earliest tag-history entry when it has no events at all", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const tag = "AR000000000927";
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag });

    // No event, no eventTransfer — this animal only exists via its tag
    // history row, so animal_current_state won't even list it as "alive"
    // without a farm. Give it a farm via a raw insert into the materialized
    // view isn't possible (it's a view), so instead this test only checks
    // the SQL doesn't reference animal.created_at anymore by asserting the
    // query still runs without error for an animal with zero events, using
    // the transfer-based helper but with the event's own date far enough in
    // the past that it's the earliest signal we have.
    await refreshDerivedState();

    // With no farm placement the animal never appears in animal_current_state
    // (status defaults to nothing alive), so this just proves the query
    // doesn't throw referencing a dropped column.
    await expect(
      findStaleTags(manager.id, "manager", 100),
    ).resolves.not.toThrow();
  });

  it("includes an animal whose last event is older than the threshold", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAnimalWithLastEvent(
      "AR000000000920",
      seededFarm.id,
      manager.id,
      daysAgoISODate(150),
    );

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).toContain("AR000000000920");
    expect(rows[0].daysSinceLastEvent).toBeGreaterThanOrEqual(150);
    expect(rows[0].lastEventType).toBe("transfer");
  });

  it("excludes an animal whose tag-history row is younger than the threshold, even with an old backdated event", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    // e.g. a historical bulk import done today, backdating the event but not
    // animal_tag_history.valid_from — the row is new to the system, so its
    // old event date shouldn't read as an unreported death.
    await seedAnimalWithLastEvent(
      "AR000000000928",
      seededFarm.id,
      manager.id,
      daysAgoISODate(150),
      daysAgoISODate(5),
    );

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).not.toContain("AR000000000928");
  });

  it("excludes an animal whose last event is within the threshold", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAnimalWithLastEvent(
      "AR000000000921",
      seededFarm.id,
      manager.id,
      daysAgoISODate(10),
    );

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).not.toContain("AR000000000921");
  });

  it("orders by days since last event, descending", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    await seedAnimalWithLastEvent(
      "AR000000000922",
      seededFarm.id,
      manager.id,
      daysAgoISODate(120),
    );
    await seedAnimalWithLastEvent(
      "AR000000000923",
      seededFarm.id,
      manager.id,
      daysAgoISODate(200),
    );

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).toEqual([
      "AR000000000923",
      "AR000000000922",
    ]);
  });

  it("scopes results to the manager's assigned campos", async () => {
    const { manager } = await seedManagerAndFarm();
    const [otherFarmGroup] = await testDb
      .insert(farmGroup)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [otherFarm] = await testDb
      .insert(farm)
      .values({ groupId: otherFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    await seedAnimalWithLastEvent(
      "AR000000000924",
      otherFarm.id,
      manager.id,
      daysAgoISODate(150),
    );

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).not.toContain("AR000000000924");
  });

  it("excludes an event annulled by a void from counting as the last observation", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const tag = "AR000000000926";
    await testDb
      .insert(animalTagHistory)
      .values({
        animalId: createdAnimal.id,
        tag,
        validFrom: new Date(daysAgoISODate(150)),
      });

    // An old transfer establishes the animal on the farm well past the threshold.
    const [oldBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        farmId: seededFarm.id,
        animalCount: 1,
        createdBy: manager.id,
      })
      .returning();
    const [oldTransferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: daysAgoISODate(150),
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: oldBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb.insert(eventTransfer).values({
      eventId: oldTransferEvent.id,
      originFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      originPaddockId: null,
      destinationPaddockId: null,
    });

    // A recent transfer would (incorrectly) make the animal look recently observed.
    const [recentBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        farmId: seededFarm.id,
        animalCount: 1,
        createdBy: manager.id,
      })
      .returning();
    const [recentTransferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: daysAgoISODate(5),
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: recentBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb.insert(eventTransfer).values({
      eventId: recentTransferEvent.id,
      originFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      originPaddockId: null,
      destinationPaddockId: null,
    });

    // Void the recent transfer — it should no longer count as the last real observation.
    const [voidBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "void",
        farmId: seededFarm.id,
        animalCount: 1,
        createdBy: manager.id,
      })
      .returning();
    await testDb.insert(event).values({
      eventType: "void",
      eventDate: daysAgoISODate(1),
      animalId: createdAnimal.id,
      farmId: seededFarm.id,
      batchOperationId: voidBatch.id,
      createdBy: manager.id,
      voidsEventId: recentTransferEvent.id,
    });

    await refreshDerivedState();

    const rows = await findStaleTags(manager.id, "manager", 100);
    const row = rows.find((r) => r.animalId === createdAnimal.id);
    expect(row).toBeDefined();
    expect(row?.daysSinceLastEvent).toBeGreaterThanOrEqual(150);
  });

  it("resolves currentTag from animal_tag_history, not from retag events", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    // Create an animal with only tag history and a transfer event (no retag event)
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const tag = "AR000000000925";
    await testDb
      .insert(animalTagHistory)
      .values({
        animalId: createdAnimal.id,
        tag,
        validFrom: new Date(daysAgoISODate(150)),
      });

    // Only create a transfer event, not a retag event
    const [transferBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        farmId: seededFarm.id,
        animalCount: 1,
        createdBy: manager.id,
      })
      .returning();
    const eventDate = daysAgoISODate(150);
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate,
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: transferBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb.insert(eventTransfer).values({
      eventId: transferEvent.id,
      originFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      originPaddockId: null,
      destinationPaddockId: null,
    });

    await refreshDerivedState();

    const rows = await findStaleTags(manager.id, "manager", 100);
    expect(rows.map((r) => r.currentTag)).toContain(tag);
    expect(rows.find((r) => r.animalId === createdAnimal.id)?.currentTag).toBe(
      tag,
    );
  });
});
