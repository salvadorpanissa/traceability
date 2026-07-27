import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, userFarm, category, animal, event, eventRecategorize, batchOperation } from "@/db/schema";
import type { RecategorizeResolvedRow } from "@/lib/activities/recategorize-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmRecategorizeBatch } = await import("@/lib/activities/recategorize");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmAndAdmin(farmName = "Campo Norte") {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: farmName }).returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { admin, seededFarm };
}

// event.animalId is a NOT NULL foreign key to animal.id — every test row
// needs a real animal row behind it, not just a random UUID.
async function seedBareAnimal(): Promise<string> {
  const [created] = await testDb.insert(animal).values({}).returning();
  return created.id;
}

function existingRow(
  farmId: string,
  overrides: Partial<Extract<RecategorizeResolvedRow, { status: "existing" }>>
): RecategorizeResolvedRow {
  return {
    tag: "AR1",
    eventDate: "2026-03-01",
    notes: null,
    status: "existing",
    animalId: "placeholder",
    currentFarmId: farmId,
    currentCategoryId: "placeholder",
    currentCategoryName: "Novillo",
    ...overrides,
  } as RecategorizeResolvedRow;
}

function ageResolvedRow(
  farmId: string,
  overrides: Partial<Extract<RecategorizeResolvedRow, { status: "age-resolved" }>>
): RecategorizeResolvedRow {
  return {
    tag: "AR2",
    eventDate: "2026-03-01",
    notes: null,
    status: "age-resolved",
    animalId: "placeholder",
    currentFarmId: farmId,
    resolvedCategoryId: "placeholder",
    resolvedCategoryName: "Ternero/a",
    ...overrides,
  } as RecategorizeResolvedRow;
}

function unresolvableRow(
  farmId: string,
  overrides: Partial<Extract<RecategorizeResolvedRow, { status: "age-unresolvable" }>>
): RecategorizeResolvedRow {
  return {
    tag: "AR3",
    eventDate: "2026-03-01",
    notes: null,
    status: "age-unresolvable",
    animalId: "placeholder",
    currentFarmId: farmId,
    ...overrides,
  } as RecategorizeResolvedRow;
}

describe("confirmRecategorizeBatch", () => {
  it("creates a manual recategorize event for an animal whose category changes", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [novilloPlus3] = await testDb.insert(category).values({ name: "Novillo +3 años" }).returning();
    const animalId = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloPlus3.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: novillo.id })],
      unresolvableDecisions: {},
    });

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("recategorize");

    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat.oldCategoryId).toBe(novillo.id);
    expect(recat.newCategoryId).toBe(novilloPlus3.id);
    expect(recat.source).toBe("manual");

    const [batch] = await testDb.select().from(batchOperation);
    expect(batch.eventType).toBe("recategorize");
    expect(batch.animalCount).toBe(1);
  });

  it("skips an animal whose category already equals the target, without creating an event", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const unchangedAnimalId = await seedBareAnimal();
    const changingAnimalId = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [
        existingRow(seededFarm.id, { animalId: unchangedAnimalId, currentCategoryId: novillo.id, tag: "AR1" }),
        existingRow(seededFarm.id, { animalId: changingAnimalId, currentCategoryId: other.id, tag: "AR2" }),
      ],
      unresolvableDecisions: {},
    });

    const unchangedEvents = await testDb.select().from(event).where(eq(event.animalId, unchangedAnimalId));
    expect(unchangedEvents).toHaveLength(0);
    const changingEvents = await testDb.select().from(event).where(eq(event.animalId, changingAnimalId));
    expect(changingEvents).toHaveLength(1);

    const [batch] = await testDb.select().from(batchOperation);
    expect(batch.animalCount).toBe(1);
  });

  it("rejects when every row is a no-op", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedBareAnimal();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novillo.id,
        rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: novillo.id })],
        unresolvableDecisions: {},
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [otherCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const animalId = await seedBareAnimal();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novillo.id,
        rows: [
          existingRow(seededFarm.id, { animalId, currentCategoryId: otherCategory.id }),
          { tag: "AR2", eventDate: "2026-03-01", notes: null, status: "error", reason: "Caravana no encontrada" },
        ],
        unresolvableDecisions: {},
      })
    ).rejects.toThrow("El lote tiene filas con error; no se puede confirmar");

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });

  it("assigns the resolved category to an age-resolved row with a self-loop 'initial' event", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [ternero] = await testDb.insert(category).values({ name: "Ternero/a" }).returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [ageResolvedRow(seededFarm.id, { animalId, resolvedCategoryId: ternero.id })],
      unresolvableDecisions: {},
    });

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: ternero.id, newCategoryId: ternero.id, source: "initial" });
  });

  it("assigns the target category to an age-unresolvable row when the decision is 'assignTarget'", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [unresolvableRow(seededFarm.id, { animalId })],
      unresolvableDecisions: { [animalId]: "assignTarget" },
    });

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: novillo.id, newCategoryId: novillo.id, source: "initial" });
  });

  it("skips an age-unresolvable row when the decision is 'skip' (or missing)", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const skippedAnimalId = await seedBareAnimal();
    const changingAnimalId = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [
        unresolvableRow(seededFarm.id, { animalId: skippedAnimalId, tag: "AR3" }),
        ageResolvedRow(seededFarm.id, {
          animalId: changingAnimalId,
          tag: "AR4",
          resolvedCategoryId: novillo.id,
          resolvedCategoryName: "Novillo",
        }),
      ],
      unresolvableDecisions: {},
    });

    const skippedEvents = await testDb.select().from(event).where(eq(event.animalId, skippedAnimalId));
    expect(skippedEvents).toHaveLength(0);
    const [batch] = await testDb.select().from(batchOperation);
    expect(batch.animalCount).toBe(1);
  });

  it("creates one batchOperation per farm when rows span multiple farms, and checks access on each", async () => {
    const { admin, seededFarm: farmA } = await seedFarmAndAdmin("Campo A");
    const [farmB] = await testDb.insert(farm).values({ name: "Campo B" }).returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const animalOnA = await seedBareAnimal();
    const animalOnB = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [
        existingRow(farmA.id, { animalId: animalOnA, currentCategoryId: other.id, tag: "AR1" }),
        existingRow(farmB.id, { animalId: animalOnB, currentCategoryId: other.id, tag: "AR2" }),
      ],
      unresolvableDecisions: {},
    });

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.farmId).sort()).toEqual([farmA.id, farmB.id].sort());
  });

  it("rejects for a non-admin manager without access to one of the involved farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [accessibleFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: accessibleFarm.id });
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const animalId = await seedBareAnimal();

    await expect(
      confirmRecategorizeBatch({
        userId: manager.id,
        role: "manager",
        targetCategoryId: novillo.id,
        rows: [existingRow(otherFarm.id, { animalId, currentCategoryId: other.id })],
        unresolvableDecisions: {},
      })
    ).rejects.toThrow("No tenés acceso a este campo");
  });
});
