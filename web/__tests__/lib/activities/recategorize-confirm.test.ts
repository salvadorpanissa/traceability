import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  category,
  animal,
  animalTagHistory,
  event,
  eventTransfer,
  eventRecategorize,
  batchOperation,
} from "@/db/schema";
import type { RecategorizeResolvedRow } from "@/lib/activities/recategorize-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmRecategorizeBatch } =
  await import("@/lib/activities/recategorize");

// Ids of the event rows written by the seed helpers below, so assertions can
// tell the animal's pre-existing history apart from what the call under test
// wrote.
let seededEventIds: string[] = [];

beforeEach(async () => {
  await resetTestDb();
  seededEventIds = [];
});

async function seedFarmAndAdmin(establishmentName = "Campo Norte") {
  const [adminRole] = await testDb
    .insert(role)
    .values({ name: "admin" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: establishmentName })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: establishmentName })
    .returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({
      name: "Admin",
      email: "admin@example.com",
      passwordHash: "hashed",
      roleId: adminRole.id,
    })
    .returning();
  return { admin, seededFarm, seededFarmGroup };
}

// confirmRecategorizeBatch re-derives every animal's campo/categoría from
// animal_current_state instead of trusting the client-supplied preview row,
// so each test animal needs real transfer/recategorize history behind it —
// a bare `animal` row with no events resolves to "no campo asignado" and is
// (correctly) rejected as stale.
async function seedAnimalAtFarm(opts: {
  establishmentId: string;
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
    .values({
      eventType: "transfer",
      establishmentId: opts.establishmentId,
      animalCount: 1,
      createdBy: opts.createdBy,
    })
    .returning();

  const [transferEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      establishmentId: opts.establishmentId,
      batchOperationId: batch.id,
      createdBy: opts.createdBy,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({
      eventId: transferEvent.id,
      originEstablishmentId: opts.establishmentId,
      destinationEstablishmentId: opts.establishmentId,
    });
  seededEventIds.push(transferEvent.id);

  if (opts.categoryId) {
    const [recatEvent] = await testDb
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        establishmentId: opts.establishmentId,
        batchOperationId: batch.id,
        createdBy: opts.createdBy,
      })
      .returning();
    await testDb
      .insert(eventRecategorize)
      .values({
        eventId: recatEvent.id,
        oldCategoryId: opts.categoryId,
        newCategoryId: opts.categoryId,
      });
    seededEventIds.push(recatEvent.id);
  }

  return createdAnimal.id;
}

async function newEventsFor(animalId: string) {
  const events = await testDb
    .select()
    .from(event)
    .where(eq(event.animalId, animalId));
  return events.filter((e) => !seededEventIds.includes(e.id));
}

// The seed helper's own batchOperation rows are eventType 'transfer'; only
// the ones written by confirmRecategorizeBatch are 'recategorize'.
async function recategorizeBatches() {
  const batches = await testDb.select().from(batchOperation);
  return batches.filter((b) => b.eventType === "recategorize");
}

function existingRow(
  establishmentId: string,
  overrides: Partial<Extract<RecategorizeResolvedRow, { status: "existing" }>>,
): RecategorizeResolvedRow {
  return {
    tag: "AR1",
    eventDate: "2026-03-01",
    notes: null,
    status: "existing",
    animalId: "placeholder",
    currentEstablishmentId: establishmentId,
    currentCategoryId: "placeholder",
    currentCategoryName: "Novillo",
    sex: null,
    ...overrides,
  };
}

function ageResolvedRow(
  establishmentId: string,
  overrides: Partial<
    Extract<RecategorizeResolvedRow, { status: "age-resolved" }>
  >,
): RecategorizeResolvedRow {
  return {
    tag: "AR2",
    eventDate: "2026-03-01",
    notes: null,
    status: "age-resolved",
    animalId: "placeholder",
    currentEstablishmentId: establishmentId,
    resolvedCategoryId: "placeholder",
    resolvedCategoryName: "Ternero/a",
    ...overrides,
  } as RecategorizeResolvedRow;
}

function unresolvableRow(
  establishmentId: string,
  overrides: Partial<
    Extract<RecategorizeResolvedRow, { status: "age-unresolvable" }>
  >,
): RecategorizeResolvedRow {
  return {
    tag: "AR3",
    eventDate: "2026-03-01",
    notes: null,
    status: "age-unresolvable",
    animalId: "placeholder",
    currentEstablishmentId: establishmentId,
    sex: null,
    ...overrides,
  };
}

describe("confirmRecategorizeBatch", () => {
  it("creates a manual recategorize event for an animal whose category changes", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [novilloPlus3] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo +3 años" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: novillo.id,
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novilloPlus3.id, female: null },
      rows: [
        existingRow(seededFarm.id, { animalId, currentCategoryId: novillo.id }),
      ],
      unresolvableDecisions: {},
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("recategorize");

    const [recat] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat.oldCategoryId).toBe(novillo.id);
    expect(recat.newCategoryId).toBe(novilloPlus3.id);
    expect(recat.source).toBe("manual");

    const [batch] = await recategorizeBatches();
    expect(batch.eventType).toBe("recategorize");
    expect(batch.animalCount).toBe(1);
  });

  it("skips an animal whose category already equals the target, without creating an event", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [other] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const unchangedAnimalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: novillo.id,
    });
    const changingAnimalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: other.id,
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novillo.id, female: null },
      rows: [
        existingRow(seededFarm.id, {
          animalId: unchangedAnimalId,
          currentCategoryId: novillo.id,
          tag: "AR1",
        }),
        existingRow(seededFarm.id, {
          animalId: changingAnimalId,
          currentCategoryId: other.id,
          tag: "AR2",
        }),
      ],
      unresolvableDecisions: {},
    });

    expect(await newEventsFor(unchangedAnimalId)).toHaveLength(0);
    expect(await newEventsFor(changingAnimalId)).toHaveLength(1);

    const [batch] = await recategorizeBatches();
    expect(batch.animalCount).toBe(1);
  });

  it("rejects when every row is a no-op", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: novillo.id,
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: novillo.id, female: null },
        rows: [
          existingRow(seededFarm.id, {
            animalId,
            currentCategoryId: novillo.id,
          }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow(
      "Ningún animal cambia de categoría; no se puede confirmar",
    );

    expect(await recategorizeBatches()).toHaveLength(0);
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [otherCategory] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: otherCategory.id,
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: novillo.id, female: null },
        rows: [
          existingRow(seededFarm.id, {
            animalId,
            currentCategoryId: otherCategory.id,
          }),
          {
            tag: "AR2",
            eventDate: "2026-03-01",
            notes: null,
            status: "error",
            reason: "Caravana no encontrada",
          },
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow("El lote tiene filas con error; no se puede confirmar");

    expect(await recategorizeBatches()).toHaveLength(0);
  });

  it("assigns the resolved category to an age-resolved row with a self-loop 'initial' event", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [ternero] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Ternero/a", minAgeMonths: 0 })
      .returning();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      birthDate: "2025-06-01",
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novillo.id, female: null },
      rows: [
        ageResolvedRow(seededFarm.id, {
          animalId,
          resolvedCategoryId: ternero.id,
        }),
      ],
      unresolvableDecisions: {},
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({
      oldCategoryId: ternero.id,
      newCategoryId: ternero.id,
      source: "initial",
    });
  });

  it("assigns the target category to an age-unresolvable row when the decision is 'assignTarget'", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novillo.id, female: null },
      rows: [unresolvableRow(seededFarm.id, { animalId })],
      unresolvableDecisions: { [animalId]: "assignTarget" },
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({
      oldCategoryId: novillo.id,
      newCategoryId: novillo.id,
      source: "initial",
    });
  });

  it("skips an age-unresolvable row when the decision is 'skip' (or missing)", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo", minAgeMonths: 0 })
      .returning();
    const skippedAnimalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
    });
    const changingAnimalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      birthDate: "2024-01-01",
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novillo.id, female: null },
      rows: [
        unresolvableRow(seededFarm.id, {
          animalId: skippedAnimalId,
          tag: "AR3",
        }),
        ageResolvedRow(seededFarm.id, {
          animalId: changingAnimalId,
          tag: "AR4",
          resolvedCategoryId: novillo.id,
          resolvedCategoryName: "Novillo",
        }),
      ],
      unresolvableDecisions: {},
    });

    expect(await newEventsFor(skippedAnimalId)).toHaveLength(0);
    const [batch] = await recategorizeBatches();
    expect(batch.animalCount).toBe(1);
  });

  it("creates one batchOperation scoped to the chosen campo", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [other] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: other.id,
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novillo.id, female: null },
      rows: [
        existingRow(seededFarm.id, {
          animalId,
          currentCategoryId: other.id,
          tag: "AR1",
        }),
      ],
      unresolvableDecisions: {},
    });

    const batches = await recategorizeBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0].establishmentId).toBe(seededFarm.id);
  });

  // A batch is scoped to a farm group (operatingFarmId), not a single
  // establecimiento — a farm group with several establecimientos should
  // recategorize animals on any of them in one go, writing one batchOperation
  // per establecimiento actually touched.
  it("confirms animals on two different establishments of the same farm group in one batch", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [otherEstablishment] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [other] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const animalOnFirst = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: other.id,
      sex: "male",
    });
    const animalOnSecond = await seedAnimalAtFarm({
      establishmentId: otherEstablishment.id,
      createdBy: admin.id,
      categoryId: other.id,
      sex: "male",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novillo.id, female: null },
      rows: [
        existingRow(seededFarm.id, { animalId: animalOnFirst, currentCategoryId: other.id, tag: "AR1" }),
        existingRow(otherEstablishment.id, { animalId: animalOnSecond, currentCategoryId: other.id, tag: "AR2" }),
      ],
      unresolvableDecisions: {},
    });

    expect(await newEventsFor(animalOnFirst)).toHaveLength(1);
    expect(await newEventsFor(animalOnSecond)).toHaveLength(1);

    const batches = await recategorizeBatches();
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.establishmentId).sort()).toEqual(
      [seededFarm.id, otherEstablishment.id].sort(),
    );
  });

  // The batch is scoped to one farm group now (operatingFarmId); a row whose
  // animal really lives elsewhere per the fresh DB read must not sneak
  // through even if the client-supplied row claims otherwise.
  it("rejects a row whose animal is on a different farm group than operatingFarmId", async () => {
    const { admin, seededFarm: farmA, seededFarmGroup } = await seedFarmAndAdmin("Campo A");
    const [farmBGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo B" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: farmBGroup.id, name: "Campo B" })
      .returning();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [other] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const animalOnB = await seedAnimalAtFarm({
      establishmentId: farmB.id,
      createdBy: admin.id,
      categoryId: other.id,
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: novillo.id, female: null },
        rows: [
          existingRow(farmA.id, {
            animalId: animalOnB,
            currentCategoryId: other.id,
            tag: "AR2",
          }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow(
      "El lote cambió desde que se generó la vista previa; volvé a subir el archivo.",
    );

    expect(await recategorizeBatches()).toHaveLength(0);
  });

  it("rejects for a non-admin manager without access to one of the involved farms", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [accessibleFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [accessibleFarm] = await testDb
      .insert(establishment)
      .values({ farmId: accessibleFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [otherFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Sur" })
      .returning();
    const [otherFarm] = await testDb
      .insert(establishment)
      .values({ farmId: otherFarmGroup.id, name: "Campo Sur" })
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
      .values({ userId: manager.id, farmId: accessibleFarmGroup.id });
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: otherFarmGroup.id, name: "Novillo" })
      .returning();
    const [other] = await testDb
      .insert(category)
      .values({ farmId: otherFarmGroup.id, name: "Vaca" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: otherFarm.id,
      createdBy: manager.id,
      categoryId: other.id,
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: otherFarmGroup.id,
        targetCategoryIdBySex: { male: novillo.id, female: null },
        rows: [
          existingRow(otherFarm.id, { animalId, currentCategoryId: other.id }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow("No tenés acceso a este grupo de campos");
  });

  // Finding 1: the preview row round-trips through the browser, so its
  // currentEstablishmentId is attacker-controlled. Claiming an accessible campo for an
  // animal that actually lives on an inaccessible one must not write anything.
  it("ignores a client-supplied currentEstablishmentId and enforces access against the animal's real establishment", async () => {
    const [managerRole] = await testDb
      .insert(role)
      .values({ name: "manager" })
      .returning();
    const [accessibleFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Norte" })
      .returning();
    const [accessibleFarm] = await testDb
      .insert(establishment)
      .values({ farmId: accessibleFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [foreignFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Ajeno" })
      .returning();
    const [foreignFarm] = await testDb
      .insert(establishment)
      .values({ farmId: foreignFarmGroup.id, name: "Campo Ajeno" })
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
      .values({ userId: manager.id, farmId: accessibleFarmGroup.id });
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: accessibleFarmGroup.id, name: "Novillo" })
      .returning();
    const [other] = await testDb
      .insert(category)
      .values({ farmId: foreignFarmGroup.id, name: "Vaca" })
      .returning();
    // The animal really lives on the campo the manager has NO access to.
    const animalId = await seedAnimalAtFarm({
      establishmentId: foreignFarm.id,
      createdBy: manager.id,
      categoryId: other.id,
    });
    await refreshDerivedState();

    // The manager operates the farm group they DO have access to
    // (requireFarmAccess passes), but the animal re-read fresh from the DB is
    // really on foreignFarm — the per-row farmId !== operatingFarmId guard
    // must catch this even though the client-supplied currentEstablishmentId lied about it.
    await expect(
      confirmRecategorizeBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: accessibleFarmGroup.id,
        targetCategoryIdBySex: { male: novillo.id, female: null },
        // ...but the payload claims it's on the accessible one.
        rows: [
          existingRow(accessibleFarm.id, {
            animalId,
            currentCategoryId: other.id,
          }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow(
      "El lote cambió desde que se generó la vista previa; volvé a subir el archivo.",
    );

    expect(await newEventsFor(animalId)).toHaveLength(0);
    expect(await recategorizeBatches()).toHaveLength(0);
  });

  it("rejects the batch when the client-supplied currentCategoryId is stale", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [vaca] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const [target] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo +3 años" })
      .returning();
    // DB says "Vaca"; the preview row still claims "Novillo".
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: target.id, female: null },
        rows: [
          existingRow(seededFarm.id, {
            animalId,
            currentCategoryId: novillo.id,
          }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow(
      "El lote cambió desde que se generó la vista previa; volvé a subir el archivo.",
    );

    expect(await newEventsFor(animalId)).toHaveLength(0);
    expect(await recategorizeBatches()).toHaveLength(0);
  });
  it("skips an existing row whose sex has no configured target category", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [vaca] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const [novilloMacho] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo", sex: "male" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    // Only a male target is configured; the animal is female, so
    // targetCategoryIdBySex.female is null and the row is silently skipped —
    // there's no longer a way to assign a category to the "wrong" sex.
    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: novilloMacho.id, female: null },
        rows: [
          existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow(
      "Ningún animal cambia de categoría; no se puede confirmar",
    );

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  it("never asks about sex when the animal has no sex recorded", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [vaca] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const [novilloMacho] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo", sex: "male" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
    });
    await refreshDerivedState();

    // No sex on file means neither targetCategoryIdBySex slot applies — the
    // row is skipped without any decision being asked for.
    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: novilloMacho.id, female: null },
        rows: [
          existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow(
      "Ningún animal cambia de categoría; no se puede confirmar",
    );

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  it("recategorizes animals of either sex when the same target is configured for both", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [vaca] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    // Caller points both the male and female slot at the same category —
    // the equivalent of a target with "no sex restriction".
    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: novillo.id, female: novillo.id },
      rows: [
        existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id }),
      ],
      unresolvableDecisions: {},
    });

    expect(await newEventsFor(animalId)).toHaveLength(1);
  });

  it("skips an age-unresolvable row assigned to the target when its sex has no configured target category", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [novilloMacho] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo", sex: "male" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      sex: "female",
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: novilloMacho.id, female: null },
        rows: [unresolvableRow(seededFarm.id, { animalId })],
        unresolvableDecisions: { [animalId]: "assignTarget" },
      }),
    ).rejects.toThrow(
      "Ningún animal cambia de categoría; no se puede confirmar",
    );

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  // Design spec requirement: "el sexo usado para elegir la categoría destino
  // se re-deriva de la base y no del valor que mande el cliente en la fila".
  // The preview row round-trips through the browser like
  // currentEstablishmentId/currentCategoryId do, so a client could lie about
  // an animal's sex to route it to a target it shouldn't reach.
  it("ignores a client-supplied sex and re-derives it from the database to pick the target category", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [vaca] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const [novilloMacho] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo", sex: "male" })
      .returning();
    // The animal really is female, and only a male target is configured...
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    // ...but the payload claims it's male, trying to sneak into the male
    // slot undetected.
    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        targetCategoryIdBySex: { male: novilloMacho.id, female: null },
        rows: [
          existingRow(seededFarm.id, {
            animalId,
            currentCategoryId: vaca.id,
            sex: "male",
          }),
        ],
        unresolvableDecisions: {},
      }),
    ).rejects.toThrow(
      "Ningún animal cambia de categoría; no se puede confirmar",
    );

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  it("gap-fills breed and secondaryTag on an animal that gets recategorized", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const [oldCategory] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Ternero" })
      .returning();
    const [newCategory] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Vaca" })
      .returning();
    const animalId = await seedAnimalAtFarm({
      establishmentId: seededFarm.id,
      createdBy: admin.id,
      categoryId: oldCategory.id,
      sex: "male",
    });
    await testDb
      .insert(animalTagHistory)
      .values({ animalId, tag: "AR-GAPFILL" });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      targetCategoryIdBySex: { male: newCategory.id, female: null },
      rows: [
        existingRow(seededFarm.id, {
          animalId,
          currentCategoryId: oldCategory.id,
          breed: "Angus",
          secondaryTag: "CHIP-GAPFILL",
        }),
      ],
      unresolvableDecisions: {},
    });

    const [updatedAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, animalId));
    expect(updatedAnimal.breed).toBe("Angus");
    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, animalId));
    expect(tagRow.secondaryTag).toBe("CHIP-GAPFILL");
  });
});
