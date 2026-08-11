import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  farm,
  role,
  establishment,
  userAccount,
  paddock,
  category,
  owner,
  animalTagHistory,
  animal,
  batchOperation,
  event,
  eventTransfer,
  eventRecategorize,
} from "@/db/schema";
import type { ResolvedImportRow } from "@/lib/activities/bulk-import";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmImportChunk } = await import("@/lib/activities/bulk-import");

beforeEach(async () => {
  await resetTestDb();
});

async function seedAdmin() {
  const [adminRole] = await testDb
    .insert(role)
    .values({ name: "admin" })
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
  return admin;
}

function validRow(
  establishmentId: string,
  overrides: Partial<Extract<ResolvedImportRow, { status: "valid" }>> = {},
) {
  return {
    status: "valid" as const,
    tag: "858000048233520",
    secondaryTag: null,
    ownerName: "SASG",
    establishmentId,
    paddockName: "Arerunguá",
    categoryName: "Vaca de cría",
    breed: "Hereford",
    sex: "female" as const,
    birthDate: "2021-01-01",
    eventDate: "2026-06-11",
    ...overrides,
  };
}

describe("confirmImportChunk", () => {
  it("creates the animal, its tag history with breed/secondaryTag, and the three initial events", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    const result = await confirmImportChunk({
      userId: admin.id,
      rows: [validRow(seededFarm.id, { secondaryTag: "CHIP1" })],
    });

    expect(result.createdCount).toBe(1);

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "858000048233520"));
    expect(tagRow.secondaryTag).toBe("CHIP1");

    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, tagRow.animalId));
    expect(createdAnimal.breed).toBe("Hereford");
    expect(createdAnimal.sex).toBe("female");
    expect(createdAnimal.birthDate).toBe("2021-01-01");

    const events = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    expect(events.map((e) => e.eventType).sort()).toEqual([
      "recategorize",
      "retag",
      "transfer",
    ]);
  });

  it("creates a new owner by name and links it to the animal", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    await confirmImportChunk({
      userId: admin.id,
      rows: [validRow(seededFarm.id)],
    });

    const [createdOwner] = await testDb
      .select()
      .from(owner)
      .where(eq(owner.name, "SASG"));
    expect(createdOwner).toBeDefined();
    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "858000048233520"));
    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, tagRow.animalId));
    expect(createdAnimal.ownerId).toBe(createdOwner.id);
  });

  it("reuses an existing owner instead of creating a duplicate", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();
    const [existingOwner] = await testDb
      .insert(owner)
      .values({ name: "SASG" })
      .returning();

    await confirmImportChunk({
      userId: admin.id,
      rows: [validRow(seededFarm.id)],
    });

    const owners = await testDb
      .select()
      .from(owner)
      .where(eq(owner.name, "SASG"));
    expect(owners).toHaveLength(1);
    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "858000048233520"));
    const [createdAnimal] = await testDb
      .select()
      .from(animal)
      .where(eq(animal.id, tagRow.animalId));
    expect(createdAnimal.ownerId).toBe(existingOwner.id);
  });

  it("creates a new paddock scoped to the row's establishment, and a new category, reusing them across rows in the same chunk", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    await confirmImportChunk({
      userId: admin.id,
      rows: [
        validRow(seededFarm.id, { tag: "TAG1" }),
        validRow(seededFarm.id, { tag: "TAG2" }),
      ],
    });

    const paddocks = await testDb
      .select()
      .from(paddock)
      .where(eq(paddock.name, "Arerunguá"));
    expect(paddocks).toHaveLength(1);
    expect(paddocks[0].establishmentId).toBe(seededFarm.id);

    const categories = await testDb
      .select()
      .from(category)
      .where(eq(category.name, "Vaca de cría"));
    expect(categories).toHaveLength(1);

    const [recategorize] = await testDb.select().from(eventRecategorize);
    expect(recategorize.newCategoryId).toBe(categories[0].id);

    const [transfer] = await testDb
      .select()
      .from(eventTransfer)
      .where(eq(eventTransfer.destinationEstablishmentId, seededFarm.id));
    expect(transfer.destinationPaddockId).toBe(paddocks[0].id);
    expect(transfer.originEstablishmentId).toBe(seededFarm.id);
  });

  it("reuses an existing paddock when the row's paddock name differs only in case/whitespace", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    await confirmImportChunk({
      userId: admin.id,
      rows: [
        validRow(seededFarm.id, { tag: "TAG1", paddockName: "Arerunguá" }),
        validRow(seededFarm.id, { tag: "TAG2", paddockName: "  ARERUNGUÁ  " }),
      ],
    });

    const paddocks = await testDb
      .select()
      .from(paddock)
      .where(eq(paddock.establishmentId, seededFarm.id));
    expect(paddocks).toHaveLength(1);
    expect(paddocks[0].name).toBe("Arerunguá");
  });

  it("does not create a recategorize event when the row has no category name", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    await confirmImportChunk({
      userId: admin.id,
      rows: [validRow(seededFarm.id, { categoryName: null })],
    });

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "858000048233520"));
    const events = await testDb
      .select()
      .from(event)
      .where(eq(event.animalId, tagRow.animalId));
    expect(events.some((e) => e.eventType === "recategorize")).toBe(false);
  });

  it("groups rows from different farms into separate batch_operation rows", async () => {
    const admin = await seedAdmin();
    const [farmAGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [farmA] = await testDb
      .insert(establishment)
      .values({ farmId: farmAGroup.id, name: "San Antonio" })
      .returning();
    const [farmBGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [farmB] = await testDb
      .insert(establishment)
      .values({ farmId: farmBGroup.id, name: "Cuatro Cerros" })
      .returning();

    await confirmImportChunk({
      userId: admin.id,
      rows: [
        validRow(farmA.id, { tag: "TAG1" }),
        validRow(farmB.id, { tag: "TAG2" }),
      ],
    });

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.establishmentId).sort()).toEqual(
      [farmA.id, farmB.id].sort(),
    );
  });

  it("leaves animal_current_state reflecting the imported tag, category, and paddock", async () => {
    const admin = await seedAdmin();
    const [seededFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
      .returning();

    await confirmImportChunk({
      userId: admin.id,
      rows: [validRow(seededFarm.id)],
    });

    const [tagRow] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "858000048233520"));
    const stateResult = await testDb.execute<{
      current_tag: string | null;
      current_establishment_id: string | null;
    }>(
      sql`select current_tag, current_establishment_id from animal_current_state where animal_id = ${tagRow.animalId}`,
    );
    expect(stateResult.rows[0].current_tag).toBe("858000048233520");
    expect(stateResult.rows[0].current_establishment_id).toBe(seededFarm.id);
  });
});
