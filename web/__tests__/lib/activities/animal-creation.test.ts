import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  farm,
  role,
  establishment,
  userAccount,
  category,
  owner,
  batchOperation,
  event,
  eventRetag,
  eventRecategorize,
  animalTagHistory,
  animal,
  reproductiveStatus,
} from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { createNewAnimal } = await import("@/lib/activities/animal-creation");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmAndUser() {
  const [adminRole] = await testDb
    .insert(role)
    .values({ name: "admin" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
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
  const [batch] = await testDb
    .insert(batchOperation)
    .values({
      eventType: "health",
      establishmentId: seededFarm.id,
      animalCount: 1,
      createdBy: user.id,
    })
    .returning();
  return { seededFarm, seededFarmGroup, user, batch };
}

describe("createNewAnimal", () => {
  it("creates the animal, its tag history, and a self-retag event", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000060",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: null,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, animalId));
    expect(tagRow.tag).toBe("AR000000000060");

    const events = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, animalId));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("retag");

    const [retag] = await testDb
      .select()
      .from(eventRetag)
      .where(eq(eventRetag.eventId, events[0].id));
    expect(retag.oldTag).toBe("AR000000000060");
    expect(retag.newTag).toBe("AR000000000060");
  });

  it("also creates a self-recategorize event when the row carries a category", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    const [createdCategory] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Ternero" })
      .returning();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000061",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: createdCategory.id,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    const events = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, animalId));
    expect(events.map((e) => e.eventType).sort()).toEqual([
      "recategorize",
      "retag",
    ]);

    const recategorizeEvent = events.find(
      (e) => e.eventType === "recategorize",
    )!;
    const [recategorize] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, recategorizeEvent.id));
    expect(recategorize.newCategoryId).toBe(createdCategory.id);
  });

  it("writes sex and ownerId onto the created animal", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    const [createdOwner] = await testDb
      .insert(owner)
      .values({ name: "Pérez", farmId: seededFarmGroup.id })
      .returning();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000062",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: null,
      sex: "female",
      birthDate: null,
      ownerId: createdOwner.id,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, animalId));
    expect(createdAnimal.sex).toBe("female");
    expect(createdAnimal.ownerId).toBe(createdOwner.id);
  });

  it("writes breed onto the created animal and secondaryTag onto its tag history row", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000063",
      eventDate: "2026-02-01",
      notes: null,
      secondaryTag: "CHIP-063",
      breed: "Angus",
      status: "new",
      categoryId: null,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, animalId));
    expect(createdAnimal.breed).toBe("Angus");

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, animalId));
    expect(tagRow.secondaryTag).toBe("CHIP-063");
  });

  it("deduces a birth date from the category's age bracket when the row has none", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo 1-2 años", sex: "male", minAgeMonths: 12 });
    const [category23] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo 2-3 años", sex: "male", minAgeMonths: 24 })
      .returning();
    await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo +3 años", sex: "male", minAgeMonths: 36 });
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000065",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: category23.id,
      sex: "male",
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    // Midpoint between the 24- and 36-month thresholds is 30 months before
    // the row's event date (2026-02-01), approximated to the 1st.
    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, animalId));
    expect(createdAnimal.birthDate).toBe("2023-08-01");
  });

  it("doesn't deduce a birth date when the category has no minAgeMonths", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    const [createdCategory] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Toro" })
      .returning();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000066",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: createdCategory.id,
      sex: "male",
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, animalId));
    expect(createdAnimal.birthDate).toBeNull();
  });

  it("keeps the row's own birth date instead of deducing one from the category", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo 1-2 años", sex: "male", minAgeMonths: 12 });
    const [category23] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo 2-3 años", sex: "male", minAgeMonths: 24 })
      .returning();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000067",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: category23.id,
      sex: "male",
      birthDate: "2020-05-15",
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, animalId));
    expect(createdAnimal.birthDate).toBe("2020-05-15");
  });

  it("leaves breed and secondaryTag null when the row doesn't carry them", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000064",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: null,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, {
        userId: user.id,
        operatingEstablishmentId: seededFarm.id,
        batchId: batch.id,
        row,
      }),
    );

    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, animalId));
    expect(createdAnimal.breed).toBeNull();

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, animalId));
    expect(tagRow.secondaryTag).toBeNull();
  });

  it("sets the initial reproductive status when the row carries one", async () => {
    const { seededFarm, seededFarmGroup, user, batch } = await seedFarmAndUser();
    const [status] = await testDb.insert(reproductiveStatus).values({ farmId: seededFarmGroup.id, name: "Preñada" }).returning();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000061",
      eventDate: "2026-02-01",
      notes: null,
      reproductiveStatusId: status.id,
      status: "new",
      categoryId: null,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, { userId: user.id, operatingEstablishmentId: seededFarm.id, batchId: batch.id, row })
    );

    const [created] = await testDb.select().from(animal).where(eq(animal.id, animalId));
    expect(created.reproductiveStatusId).toBe(status.id);
  });
});
