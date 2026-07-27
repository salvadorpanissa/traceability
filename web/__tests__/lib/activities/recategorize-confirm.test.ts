import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  role,
  farm,
  userAccount,
  userFarm,
  category,
  animal,
  event,
  eventTransfer,
  eventRecategorize,
  batchOperation,
} from "@/db/schema";
import type { RecategorizeResolvedRow } from "@/lib/activities/recategorize-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmRecategorizeBatch } = await import("@/lib/activities/recategorize");

// Ids of the event rows written by the seed helpers below, so assertions can
// tell the animal's pre-existing history apart from what the call under test
// wrote.
let seededEventIds: string[] = [];

beforeEach(async () => {
  await resetTestDb();
  seededEventIds = [];
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

// confirmRecategorizeBatch re-derives every animal's campo/categoría from
// animal_current_state instead of trusting the client-supplied preview row,
// so each test animal needs real transfer/recategorize history behind it —
// a bare `animal` row with no events resolves to "no campo asignado" and is
// (correctly) rejected as stale.
async function seedAnimalAtFarm(opts: {
  farmId: string;
  createdBy: string;
  categoryId?: string;
  birthDate?: string;
  sex?: "male" | "female";
}): Promise<string> {
  const [createdAnimal] = await testDb
    .insert(animal)
    .values({ birthDate: opts.birthDate ?? null, sex: opts.sex ?? null })
    .returning();

  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", farmId: opts.farmId, animalCount: 1, createdBy: opts.createdBy })
    .returning();

  const [transferEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      farmId: opts.farmId,
      batchOperationId: batch.id,
      createdBy: opts.createdBy,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({ eventId: transferEvent.id, originFarmId: opts.farmId, destinationFarmId: opts.farmId });
  seededEventIds.push(transferEvent.id);

  if (opts.categoryId) {
    const [recatEvent] = await testDb
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: opts.farmId,
        batchOperationId: batch.id,
        createdBy: opts.createdBy,
      })
      .returning();
    await testDb
      .insert(eventRecategorize)
      .values({ eventId: recatEvent.id, oldCategoryId: opts.categoryId, newCategoryId: opts.categoryId });
    seededEventIds.push(recatEvent.id);
  }

  return createdAnimal.id;
}

async function newEventsFor(animalId: string) {
  const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
  return events.filter((e) => !seededEventIds.includes(e.id));
}

// The seed helper's own batchOperation rows are eventType 'transfer'; only
// the ones written by confirmRecategorizeBatch are 'recategorize'.
async function recategorizeBatches() {
  const batches = await testDb.select().from(batchOperation);
  return batches.filter((b) => b.eventType === "recategorize");
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
    sex: null,
    ...overrides,
  };
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
    sex: null,
    ...overrides,
  };
}

describe("confirmRecategorizeBatch", () => {
  it("creates a manual recategorize event for an animal whose category changes", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [novilloPlus3] = await testDb.insert(category).values({ name: "Novillo +3 años" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, categoryId: novillo.id });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloPlus3.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: novillo.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("recategorize");

    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat.oldCategoryId).toBe(novillo.id);
    expect(recat.newCategoryId).toBe(novilloPlus3.id);
    expect(recat.source).toBe("manual");

    const [batch] = await recategorizeBatches();
    expect(batch.eventType).toBe("recategorize");
    expect(batch.animalCount).toBe(1);
  });

  it("skips an animal whose category already equals the target, without creating an event", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const unchangedAnimalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: novillo.id,
    });
    const changingAnimalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: other.id,
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [
        existingRow(seededFarm.id, { animalId: unchangedAnimalId, currentCategoryId: novillo.id, tag: "AR1" }),
        existingRow(seededFarm.id, { animalId: changingAnimalId, currentCategoryId: other.id, tag: "AR2" }),
      ],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    expect(await newEventsFor(unchangedAnimalId)).toHaveLength(0);
    expect(await newEventsFor(changingAnimalId)).toHaveLength(1);

    const [batch] = await recategorizeBatches();
    expect(batch.animalCount).toBe(1);
  });

  it("rejects when every row is a no-op", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, categoryId: novillo.id });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novillo.id,
        rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: novillo.id })],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    expect(await recategorizeBatches()).toHaveLength(0);
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [otherCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: otherCategory.id,
    });
    await refreshDerivedState();

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
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("El lote tiene filas con error; no se puede confirmar");

    expect(await recategorizeBatches()).toHaveLength(0);
  });

  it("assigns the resolved category to an age-resolved row with a self-loop 'initial' event", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [ternero] = await testDb
      .insert(category)
      .values({ name: "Ternero/a", minAgeMonths: 0 })
      .returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      birthDate: "2025-06-01",
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [ageResolvedRow(seededFarm.id, { animalId, resolvedCategoryId: ternero.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: ternero.id, newCategoryId: ternero.id, source: "initial" });
  });

  it("assigns the target category to an age-unresolvable row when the decision is 'assignTarget'", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [unresolvableRow(seededFarm.id, { animalId })],
      unresolvableDecisions: { [animalId]: "assignTarget" },
      sexMismatchDecisions: {},
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: novillo.id, newCategoryId: novillo.id, source: "initial" });
  });

  it("skips an age-unresolvable row when the decision is 'skip' (or missing)", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo", minAgeMonths: 0 }).returning();
    const skippedAnimalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id });
    const changingAnimalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      birthDate: "2024-01-01",
      sex: "male",
    });
    await refreshDerivedState();

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
      sexMismatchDecisions: {},
    });

    expect(await newEventsFor(skippedAnimalId)).toHaveLength(0);
    const [batch] = await recategorizeBatches();
    expect(batch.animalCount).toBe(1);
  });

  it("creates one batchOperation per farm when rows span multiple farms, and checks access on each", async () => {
    const { admin, seededFarm: farmA } = await seedFarmAndAdmin("Campo A");
    const [farmB] = await testDb.insert(farm).values({ name: "Campo B" }).returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const animalOnA = await seedAnimalAtFarm({ farmId: farmA.id, createdBy: admin.id, categoryId: other.id });
    const animalOnB = await seedAnimalAtFarm({ farmId: farmB.id, createdBy: admin.id, categoryId: other.id });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [
        existingRow(farmA.id, { animalId: animalOnA, currentCategoryId: other.id, tag: "AR1" }),
        existingRow(farmB.id, { animalId: animalOnB, currentCategoryId: other.id, tag: "AR2" }),
      ],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    const batches = await recategorizeBatches();
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
    const animalId = await seedAnimalAtFarm({ farmId: otherFarm.id, createdBy: manager.id, categoryId: other.id });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: manager.id,
        role: "manager",
        targetCategoryId: novillo.id,
        rows: [existingRow(otherFarm.id, { animalId, currentCategoryId: other.id })],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("No tenés acceso a este campo");
  });

  // Finding 1: the preview row round-trips through the browser, so its
  // currentFarmId is attacker-controlled. Claiming an accessible campo for an
  // animal that actually lives on an inaccessible one must not write anything.
  it("ignores a client-supplied currentFarmId and enforces access against the animal's real farm", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [accessibleFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [foreignFarm] = await testDb.insert(farm).values({ name: "Campo Ajeno" }).returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: accessibleFarm.id });
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    // The animal really lives on the campo the manager has NO access to.
    const animalId = await seedAnimalAtFarm({ farmId: foreignFarm.id, createdBy: manager.id, categoryId: other.id });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: manager.id,
        role: "manager",
        targetCategoryId: novillo.id,
        // ...but the payload claims it's on the accessible one.
        rows: [existingRow(accessibleFarm.id, { animalId, currentCategoryId: other.id })],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("No tenés acceso a este campo");

    expect(await newEventsFor(animalId)).toHaveLength(0);
    expect(await recategorizeBatches()).toHaveLength(0);
  });

  it("rejects the batch when the client-supplied currentCategoryId is stale", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [target] = await testDb.insert(category).values({ name: "Novillo +3 años" }).returning();
    // DB says "Vaca"; the preview row still claims "Novillo".
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, categoryId: vaca.id });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: target.id,
        rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: novillo.id })],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("El lote cambió desde que se generó la vista previa; volvé a subir el archivo.");

    expect(await newEventsFor(animalId)).toHaveLength(0);
    expect(await recategorizeBatches()).toHaveLength(0);
  });

  // Finding 2: one campo's transaction failing must not stop the other campos
  // from being written, nor skip the materialized-view refresh for them.
  it("still commits and refreshes the other farms when one farm's transaction fails", async () => {
    const { admin, seededFarm: farmA } = await seedFarmAndAdmin("Campo A");
    const [farmB] = await testDb.insert(farm).values({ name: "Campo B" }).returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const animalOnA = await seedAnimalAtFarm({ farmId: farmA.id, createdBy: admin.id, categoryId: other.id });
    const animalOnB = await seedAnimalAtFarm({ farmId: farmB.id, createdBy: admin.id, categoryId: other.id });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novillo.id,
        rows: [
          existingRow(farmA.id, { animalId: animalOnA, currentCategoryId: other.id, tag: "AR1" }),
          // event.event_date is a real `date` column: Postgres rejects this
          // value outright, failing only Campo B's transaction.
          existingRow(farmB.id, {
            animalId: animalOnB,
            currentCategoryId: other.id,
            tag: "AR2",
            eventDate: "no-es-una-fecha",
          }),
        ],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow(new RegExp(`No se pudo confirmar la recategorización en los campos: ${farmB.id}`));

    // Campo A's writes survived...
    const batches = await recategorizeBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0].farmId).toBe(farmA.id);
    expect(await newEventsFor(animalOnA)).toHaveLength(1);
    expect(await newEventsFor(animalOnB)).toHaveLength(0);

    // ...and the refresh ran anyway, so they're visible in the derived state.
    const state = await testDb.execute<{ current_category_id: string | null }>(
      sql`select current_category_id from animal_current_state where animal_id = ${animalOnA}`
    );
    expect(state.rows[0].current_category_id).toBe(novillo.id);
  });

  it("excludes an existing row when the animal's sex doesn't match the target category's sex and the decision is skip (default)", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novilloMacho.id,
        rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  it("writes the event for an existing row with mismatched sex when the decision is assignTarget", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloMacho.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: { [animalId]: "assignTarget" },
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: vaca.id, newCategoryId: novilloMacho.id, source: "manual" });
  });

  it("never asks about sex when the animal has no sex recorded", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, categoryId: vaca.id });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloMacho.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    expect(await newEventsFor(animalId)).toHaveLength(1);
  });

  it("never asks about sex when the target category has no sex restriction", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    expect(await newEventsFor(animalId)).toHaveLength(1);
  });

  it("excludes an age-unresolvable row assigned to the target when its sex doesn't match and the sex decision is skip", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, sex: "female" });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novilloMacho.id,
        rows: [unresolvableRow(seededFarm.id, { animalId })],
        unresolvableDecisions: { [animalId]: "assignTarget" },
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  it("writes the event for an age-unresolvable row assigned to the target despite mismatched sex when the sex decision is assignTarget", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, sex: "female" });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloMacho.id,
      rows: [unresolvableRow(seededFarm.id, { animalId })],
      unresolvableDecisions: { [animalId]: "assignTarget" },
      sexMismatchDecisions: { [animalId]: "assignTarget" },
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: novilloMacho.id, newCategoryId: novilloMacho.id, source: "initial" });
  });

  // Design spec requirement: "el sexo usado para el chequeo se re-deriva de
  // la base y no del valor que mande el cliente en la fila". The preview row
  // round-trips through the browser like currentFarmId/currentCategoryId do,
  // so a client could lie about an animal's sex to dodge the mismatch check.
  it("ignores a client-supplied sex and re-derives it from the database for the mismatch check", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    // The animal really is female...
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novilloMacho.id,
        // ...but the payload claims it's male, matching the target category
        // and trying to sneak past the mismatch check undetected.
        rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id, sex: "male" })],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });
});
