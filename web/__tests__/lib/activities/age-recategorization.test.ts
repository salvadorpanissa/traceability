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
  batchOperation,
  event,
  eventRecategorize,
  eventTransfer,
  eventDeath,
} from "@/db/schema";
import type { AgeCategoryRule } from "@/lib/activities/age-recategorization";

vi.mock("@/db", () => ({ db: testDb }));

const {
  computeAgeMonths,
  resolveCategoryForAge,
  findAnimalsNeedingAgeRecategorization,
  runAgeBasedRecategorization,
} = await import("@/lib/activities/age-recategorization");

beforeEach(async () => {
  await resetTestDb();
});

describe("computeAgeMonths", () => {
  it("computes whole elapsed months", () => {
    expect(computeAgeMonths("2023-01-01", "2026-07-24")).toBe(42);
  });

  it("does not count the current month if the day-of-month hasn't been reached yet", () => {
    expect(computeAgeMonths("2023-01-15", "2026-07-01")).toBe(41);
  });

  it("counts the current month once the day-of-month has been reached", () => {
    expect(computeAgeMonths("2023-01-15", "2026-07-15")).toBe(42);
  });

  it("returns 0 for a birth date in the future", () => {
    expect(computeAgeMonths("2027-01-01", "2026-07-24")).toBe(0);
  });

  it("returns 0 for a birth date equal to asOfDate", () => {
    expect(computeAgeMonths("2026-07-24", "2026-07-24")).toBe(0);
  });
});

describe("resolveCategoryForAge", () => {
  const rules: AgeCategoryRule[] = [
    { id: "calf", sex: null, minAgeMonths: 0 },
    { id: "male-1-2", sex: "male", minAgeMonths: 12 },
    { id: "male-2-3", sex: "male", minAgeMonths: 24 },
    { id: "male-3-plus", sex: "male", minAgeMonths: 36 },
    { id: "female-1-2", sex: "female", minAgeMonths: 12 },
    { id: "female-2-3", sex: "female", minAgeMonths: 24 },
    { id: "manual-only", sex: null, minAgeMonths: null },
  ];

  it("picks the highest bracket at or below the animal's age, for its sex", () => {
    expect(resolveCategoryForAge(rules, "male", 30)).toBe("male-2-3");
    expect(resolveCategoryForAge(rules, "female", 30)).toBe("female-2-3");
  });

  it("picks the open-ended top bracket once past its threshold", () => {
    expect(resolveCategoryForAge(rules, "male", 50)).toBe("male-3-plus");
  });

  it("falls back to a sex-unscoped bracket when no sex-specific one applies yet", () => {
    expect(resolveCategoryForAge(rules, "male", 3)).toBe("calf");
  });

  it("never crosses into the other sex's track", () => {
    expect(resolveCategoryForAge(rules, "female", 50)).toBe("female-2-3");
  });

  it("ignores categories with no minAgeMonths configured", () => {
    // manual-only has minAgeMonths: null and must never be selected, regardless of age.
    expect(resolveCategoryForAge(rules, "male", 100)).not.toBe("manual-only");
  });

  it("returns null when the animal is younger than every configured bracket", () => {
    const onlyOlderBrackets: AgeCategoryRule[] = [
      { id: "male-3-plus", sex: "male", minAgeMonths: 36 },
    ];
    expect(resolveCategoryForAge(onlyOlderBrackets, "male", 10)).toBeNull();
  });
});

async function seedAgeManagedCategories(farmId: string) {
  const [calf] = await testDb
    .insert(category)
    .values({ farmId, name: "Ternero/a" })
    .returning();
  const [male12] = await testDb
    .insert(category)
    .values({ farmId, name: "Novillo 1 a 2 años", sex: "male", minAgeMonths: 12 })
    .returning();
  const [male24] = await testDb
    .insert(category)
    .values({ farmId, name: "Novillo 2 a 3 años", sex: "male", minAgeMonths: 24 })
    .returning();
  const [male36] = await testDb
    .insert(category)
    .values({ farmId, name: "Novillo +3 años", sex: "male", minAgeMonths: 36 })
    .returning();
  const [female12] = await testDb
    .insert(category)
    .values({ farmId, name: "Vaquillona 1 a 2 años", sex: "female", minAgeMonths: 12 })
    .returning();
  const [female24] = await testDb
    .insert(category)
    .values({ farmId, name: "Vaquillona 2 a 3 años", sex: "female", minAgeMonths: 24 })
    .returning();
  const [manualOnly] = await testDb
    .insert(category)
    .values({ farmId, name: "Cuarentena" })
    .returning();
  return { calf, male12, male24, male36, female12, female24, manualOnly };
}

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
  await testDb
    .insert(userFarm)
    .values({ userId: admin.id, farmId: seededFarmGroup.id });
  return { admin, seededFarm, seededFarmGroup };
}

// Creates an animal already "alive" on seededFarm, with a real event_transfer
// (so animal_current_state.current_establishment_id/status resolve) and a real
// event_recategorize into initialCategoryId (source defaults to 'initial'
// unless overridden) — mirrors what confirmTransferBatch's createNewAnimal
// does, but lets tests control the exact events/source directly.
async function seedAnimal(input: {
  establishmentId: string;
  adminId: string;
  tag: string;
  sex: "male" | "female";
  birthDate: string;
  initialCategoryId: string;
  categorySource?: "initial" | "manual" | "auto_age";
}) {
  const [createdAnimal] = await testDb
    .insert(animal)
    .values({ sex: input.sex, birthDate: input.birthDate })
    .returning();
  await testDb
    .insert(animalTagHistory)
    .values({ animalId: createdAnimal.id, tag: input.tag });

  const [batch] = await testDb
    .insert(batchOperation)
    .values({
      eventType: "transfer",
      establishmentId: input.establishmentId,
      animalCount: 1,
      createdBy: input.adminId,
    })
    .returning();
  const [transferEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2020-01-01",
      animalId: createdAnimal.id,
      establishmentId: input.establishmentId,
      batchOperationId: batch.id,
      createdBy: input.adminId,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({
      eventId: transferEvent.id,
      originEstablishmentId: input.establishmentId,
      destinationEstablishmentId: input.establishmentId,
    });

  const [recategorizeEvent] = await testDb
    .insert(event)
    .values({
      eventType: "recategorize",
      eventDate: "2020-01-01",
      animalId: createdAnimal.id,
      establishmentId: input.establishmentId,
      batchOperationId: batch.id,
      createdBy: input.adminId,
    })
    .returning();
  await testDb.insert(eventRecategorize).values({
    eventId: recategorizeEvent.id,
    oldCategoryId: input.initialCategoryId,
    newCategoryId: input.initialCategoryId,
    source: input.categorySource ?? "initial",
  });

  // animal_current_state is a materialized view refreshed explicitly by app
  // code after each batch (see test/refresh-derived-state.ts); since this
  // helper seeds event rows directly rather than going through a production
  // activity, it must refresh the view itself before callers query it.
  await refreshDerivedState();

  return createdAnimal;
}

describe("findAnimalsNeedingAgeRecategorization", () => {
  it("finds an animal that crossed into the next age bracket", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24, male36 } = await seedAgeManagedCategories(seededFarmGroup.id);
    const oldEnough = await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      sex: "male",
      birthDate: "2023-01-01", // 42 months old as of 2026-07-24
      initialCategoryId: male24.id,
    });

    const candidates =
      await findAnimalsNeedingAgeRecategorization("2026-07-24");

    expect(candidates).toEqual([
      {
        animalId: oldEnough.id,
        establishmentId: seededFarm.id,
        currentCategoryId: male24.id,
        targetCategoryId: male36.id,
      },
    ]);
  });

  // Downgrade-guard regression case: this animal is seeded directly into
  // male24 (via initialCategoryId) even though its birth date only computes
  // to 18 months — old enough for male12 but not male24. resolveCategoryForAge
  // would resolve a target of male12 here, which is a LOWER bracket than the
  // animal's current male24. Without the currentMinAgeMonths/targetMinAgeMonths
  // guard in findAnimalsNeedingAgeRecategorization, this animal would be
  // silently moved BACKWARD from male24 to male12. This test asserts it's
  // excluded instead.
  it("does not include an animal that hasn't reached the next bracket yet", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR2",
      sex: "male",
      birthDate: "2025-01-01", // 18 months old, still within male24's bracket
      initialCategoryId: male24.id,
    });

    expect(await findAnimalsNeedingAgeRecategorization("2026-07-24")).toEqual(
      [],
    );
  });

  it("never touches an animal in a category with no minAgeMonths configured", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { manualOnly } = await seedAgeManagedCategories(seededFarmGroup.id);
    await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR3",
      sex: "male",
      birthDate: "2000-01-01", // ancient — would match every bracket if it were eligible
      initialCategoryId: manualOnly.id,
    });

    expect(await findAnimalsNeedingAgeRecategorization("2026-07-24")).toEqual(
      [],
    );
  });

  it("respects a manual override — never recategorizes an animal whose last event source is 'manual'", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR4",
      sex: "male",
      birthDate: "2023-01-01", // old enough to bump, per findAnimalsNeedingAgeRecategorization's own math
      initialCategoryId: male24.id,
      categorySource: "manual",
    });

    expect(await findAnimalsNeedingAgeRecategorization("2026-07-24")).toEqual(
      [],
    );
  });

  it("excludes an animal with no birth date", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    const [createdAnimal] = await testDb
      .insert(animal)
      .values({ sex: "male" })
      .returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR5" });
    const [batch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        establishmentId: seededFarm.id,
        animalCount: 1,
        createdBy: admin.id,
      })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2020-01-01",
        animalId: createdAnimal.id,
        establishmentId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({
        eventId: transferEvent.id,
        originEstablishmentId: seededFarm.id,
        destinationEstablishmentId: seededFarm.id,
      });
    const [recategorizeEvent] = await testDb
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: "2020-01-01",
        animalId: createdAnimal.id,
        establishmentId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventRecategorize)
      .values({
        eventId: recategorizeEvent.id,
        oldCategoryId: male24.id,
        newCategoryId: male24.id,
      });
    await refreshDerivedState();

    expect(await findAnimalsNeedingAgeRecategorization("2026-07-24")).toEqual(
      [],
    );
  });

  it("jumps straight to the correct final bracket in one run, skipping intermediate brackets", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male12, male36 } = await seedAgeManagedCategories(seededFarmGroup.id);
    const veryOld = await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR12",
      sex: "male",
      birthDate: "2023-03-01", // ~40 months old as of 2026-07-24, well past male36's 36-month threshold
      initialCategoryId: male12.id,
    });

    const candidates =
      await findAnimalsNeedingAgeRecategorization("2026-07-24");

    expect(candidates).toEqual([
      {
        animalId: veryOld.id,
        establishmentId: seededFarm.id,
        currentCategoryId: male12.id,
        targetCategoryId: male36.id,
      },
    ]);
  });

  it("excludes an animal that is dead or sold, even if otherwise due for recategorization", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    const deadAnimal = await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR13",
      sex: "male",
      birthDate: "2023-01-01", // old enough to bump, per findAnimalsNeedingAgeRecategorization's own math
      initialCategoryId: male24.id,
    });

    const [deathBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "death",
        establishmentId: seededFarm.id,
        animalCount: 1,
        createdBy: admin.id,
      })
      .returning();
    const [deathEvent] = await testDb
      .insert(event)
      .values({
        eventType: "death",
        eventDate: "2026-06-01",
        animalId: deadAnimal.id,
        establishmentId: seededFarm.id,
        batchOperationId: deathBatch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb.insert(eventDeath).values({ eventId: deathEvent.id });
    await refreshDerivedState();

    expect(await findAnimalsNeedingAgeRecategorization("2026-07-24")).toEqual(
      [],
    );
  });

  it("excludes an animal with no sex recorded", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    const [createdAnimal] = await testDb
      .insert(animal)
      .values({ birthDate: "2023-01-01" })
      .returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR14" });
    const [batch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "transfer",
        establishmentId: seededFarm.id,
        animalCount: 1,
        createdBy: admin.id,
      })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2020-01-01",
        animalId: createdAnimal.id,
        establishmentId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({
        eventId: transferEvent.id,
        originEstablishmentId: seededFarm.id,
        destinationEstablishmentId: seededFarm.id,
      });
    const [recategorizeEvent] = await testDb
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: "2020-01-01",
        animalId: createdAnimal.id,
        establishmentId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventRecategorize)
      .values({
        eventId: recategorizeEvent.id,
        oldCategoryId: male24.id,
        newCategoryId: male24.id,
      });
    await refreshDerivedState();

    expect(await findAnimalsNeedingAgeRecategorization("2026-07-24")).toEqual(
      [],
    );
  });

  it("groups candidates from different farms separately", async () => {
    const { admin, seededFarm: farmA, seededFarmGroup } = await seedFarmAndAdmin("Campo A");
    const [farmBGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo B" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: farmBGroup.id, name: "Campo B" })
      .returning();
    await testDb
      .insert(userFarm)
      .values({ userId: admin.id, farmId: farmBGroup.id });
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    const animalOnA = await seedAnimal({
      establishmentId: farmA.id,
      adminId: admin.id,
      tag: "AR6",
      sex: "male",
      birthDate: "2023-01-01",
      initialCategoryId: male24.id,
    });
    const animalOnB = await seedAnimal({
      establishmentId: farmB.id,
      adminId: admin.id,
      tag: "AR7",
      sex: "male",
      birthDate: "2023-01-01",
      initialCategoryId: male24.id,
    });

    const candidates =
      await findAnimalsNeedingAgeRecategorization("2026-07-24");

    expect(candidates.map((c) => c.animalId).sort()).toEqual(
      [animalOnA.id, animalOnB.id].sort(),
    );
    expect(candidates.find((c) => c.animalId === animalOnA.id)?.establishmentId).toBe(
      farmA.id,
    );
    expect(candidates.find((c) => c.animalId === animalOnB.id)?.establishmentId).toBe(
      farmB.id,
    );
  });
});

describe("runAgeBasedRecategorization", () => {
  it("writes a real recategorize event and updates animal_current_state", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24, male36 } = await seedAgeManagedCategories(seededFarmGroup.id);
    const oldEnough = await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR8",
      sex: "male",
      birthDate: "2023-01-01",
      initialCategoryId: male24.id,
    });

    const result = await runAgeBasedRecategorization({
      asOfDate: "2026-07-24",
    });

    expect(result).toEqual({ recategorized: 1 });

    const events = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, oldEnough.id));
    const newRecategorizeEvent = events
      .filter((e) => e.eventType === "recategorize")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .at(-1)!;
    const [recategorizeRow] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, newRecategorizeEvent.id));
    expect(recategorizeRow.oldCategoryId).toBe(male24.id);
    expect(recategorizeRow.newCategoryId).toBe(male36.id);
    expect(recategorizeRow.source).toBe("auto_age");

    const stateResult = await testDb.execute<{
      current_category_id: string | null;
    }>(
      sql`select current_category_id from animal_current_state where animal_id = ${oldEnough.id}`,
    );
    expect(stateResult.rows[0].current_category_id).toBe(male36.id);
  });

  it("creates one batchOperation per establishment when animals span multiple farms", async () => {
    const { admin, seededFarm: farmA, seededFarmGroup } = await seedFarmAndAdmin("Campo A");
    const [farmBGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo B" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: farmBGroup.id, name: "Campo B" })
      .returning();
    await testDb
      .insert(userFarm)
      .values({ userId: admin.id, farmId: farmBGroup.id });
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    await seedAnimal({
      establishmentId: farmA.id,
      adminId: admin.id,
      tag: "AR9",
      sex: "male",
      birthDate: "2023-01-01",
      initialCategoryId: male24.id,
    });
    await seedAnimal({
      establishmentId: farmB.id,
      adminId: admin.id,
      tag: "AR10",
      sex: "male",
      birthDate: "2023-01-01",
      initialCategoryId: male24.id,
    });

    await runAgeBasedRecategorization({ asOfDate: "2026-07-24" });

    const batches = await testDb
      .select()
      .from(batchOperation)
      .where(eq(batchOperation.eventType, "recategorize"));
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.establishmentId).sort()).toEqual(
      [farmA.id, farmB.id].sort(),
    );
  });

  it("is idempotent — running it twice in a row recategorizes 0 the second time", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const { male24 } = await seedAgeManagedCategories(seededFarmGroup.id);
    await seedAnimal({
      establishmentId: seededFarm.id,
      adminId: admin.id,
      tag: "AR11",
      sex: "male",
      birthDate: "2023-01-01",
      initialCategoryId: male24.id,
    });

    const first = await runAgeBasedRecategorization({ asOfDate: "2026-07-24" });
    const second = await runAgeBasedRecategorization({
      asOfDate: "2026-07-24",
    });

    expect(first.recategorized).toBe(1);
    expect(second.recategorized).toBe(0);
  });

  it("returns 0 and writes nothing when there are no candidates", async () => {
    const { seededFarmGroup } = await seedFarmAndAdmin();
    await seedAgeManagedCategories(seededFarmGroup.id);

    const result = await runAgeBasedRecategorization({
      asOfDate: "2026-07-24",
    });

    expect(result).toEqual({ recategorized: 0 });
    expect(await testDb.select().from(batchOperation)).toEqual([]);
  });
});
