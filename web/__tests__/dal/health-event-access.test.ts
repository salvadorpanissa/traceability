import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import {
  role,
  farm,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventHealth,
  eventRetag,
  paddock,
  product,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { visibleHealthEventsSince } = await import("@/lib/dal/health-event-access");

beforeEach(async () => {
  await resetTestDb();
});

async function seedHealthEvent(input: {
  farmId: string;
  paddockId: string | null;
  productId: string;
  adminId: string;
  eventDate: string;
  tag: string;
}) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: input.tag });

  const [placementBatch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", farmId: input.farmId, animalCount: 1, createdBy: input.adminId })
    .returning();
  const [placementEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: input.eventDate,
      animalId: createdAnimal.id,
      farmId: input.farmId,
      batchOperationId: placementBatch.id,
      createdBy: input.adminId,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({ eventId: placementEvent.id, originFarmId: input.farmId, destinationFarmId: input.farmId });

  // Self-retag: animal_current_state.current_tag only reflects the latest
  // event_retag row, not animal_tag_history directly.
  const [retagBatch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "retag", farmId: input.farmId, animalCount: 1, createdBy: input.adminId })
    .returning();
  const [retagEvent] = await testDb
    .insert(event)
    .values({
      eventType: "retag",
      eventDate: input.eventDate,
      animalId: createdAnimal.id,
      farmId: input.farmId,
      batchOperationId: retagBatch.id,
      createdBy: input.adminId,
    })
    .returning();
  await testDb.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: input.tag, newTag: input.tag });

  const [healthBatch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "health", farmId: input.farmId, animalCount: 1, createdBy: input.adminId })
    .returning();
  const [healthEvent] = await testDb
    .insert(event)
    .values({
      eventType: "health",
      eventDate: input.eventDate,
      animalId: createdAnimal.id,
      farmId: input.farmId,
      batchOperationId: healthBatch.id,
      createdBy: input.adminId,
    })
    .returning();
  await testDb.insert(eventHealth).values({
    eventId: healthEvent.id,
    productId: input.productId,
    dose: "10",
    doseUnit: "ml",
    route: "subcutánea",
    paddockId: input.paddockId,
  });

  await refreshDerivedState();
  return { animalId: createdAnimal.id, eventId: healthEvent.id };
}

describe("visibleHealthEventsSince", () => {
  it("returns a health event with farm, paddock, product, and current tag resolved", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [seededPaddock] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero 1" }).returning();
    const [seededProduct] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();

    await seedHealthEvent({
      farmId: seededFarm.id,
      paddockId: seededPaddock.id,
      productId: seededProduct.id,
      adminId: admin.id,
      eventDate: "2026-06-01",
      tag: "AR000000000060",
    });

    const rows = await visibleHealthEventsSince(admin.id, "admin", "2026-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      animalTag: "AR000000000060",
      farmName: "Campo Norte",
      paddockName: "Potrero 1",
      productName: "Ivermectina 1%",
      eventDate: "2026-06-01",
    });
  });

  it("excludes events before the given date", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [seededProduct] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();

    await seedHealthEvent({
      farmId: seededFarm.id,
      paddockId: null,
      productId: seededProduct.id,
      adminId: admin.id,
      eventDate: "2025-01-01",
      tag: "AR000000000061",
    });

    expect(await visibleHealthEventsSince(admin.id, "admin", "2026-01-01")).toEqual([]);
  });

  it("scopes results to the manager's assigned farm", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [seededProduct] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: farmNorte.id });

    for (const [targetFarm, tag] of [
      [farmNorte, "AR000000000062"],
      [farmSur, "AR000000000063"],
    ] as const) {
      await seedHealthEvent({
        farmId: targetFarm.id,
        paddockId: null,
        productId: seededProduct.id,
        adminId: admin.id,
        eventDate: "2026-06-01",
        tag,
      });
    }

    const rows = await visibleHealthEventsSince(manager.id, "manager", "2026-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].farmName).toBe("Campo Norte");
  });

  it("returns an empty array for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [unassigned] = await testDb
      .insert(userAccount)
      .values({ name: "Sin campo", email: "sincampo@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();

    expect(await visibleHealthEventsSince(unassigned.id, "manager", "2026-01-01")).toEqual([]);
  });
});
