import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, owner, dicoseRegistration, category, ownTag, paddock, animal, animalTagHistory } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { MappedOwnTagRow } from "@/lib/activities/column-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { importOwnTags, countOwnTagsByRegistration, findMissingPaddockNames, findMissingCategoryNames } =
  await import("@/lib/dal/own-tag");

beforeEach(async () => {
  await resetTestDb();
});

function tagRows(tags: string[]): MappedOwnTagRow[] {
  return tags.map((tag) => ({ tag, sex: null, category: null, birthDate: null, paddock: null, date: null }));
}

async function seedRegistration() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: createdOwner.id, farmId: seededFarm.id, dicoseCode: "151400442" })
    .returning();
  return { registration, user };
}

describe("importOwnTags", () => {
  it("inserts new tags, ignoring blank and invalid values", async () => {
    const { registration, user } = await seedRegistration();

    const result = await importOwnTags(registration.id, user.id, tagRows(["100", "", "abc", "  200  "]));

    expect(result).toEqual({ inserted: 2, updated: 0, located: 0, recategorized: 0, skipped: 0, invalid: 1 });
  });

  it("ignores duplicates within the same file and against already-imported tags with nothing new to add", async () => {
    const { registration, user } = await seedRegistration();
    await importOwnTags(registration.id, user.id, tagRows(["100"]));

    const result = await importOwnTags(registration.id, user.id, tagRows(["100", "100", "200"]));

    expect(result).toEqual({ inserted: 1, updated: 0, located: 0, recategorized: 0, skipped: 2, invalid: 0 });
  });

  it("stores sex, category, and birth date when the columns are mapped", async () => {
    const { registration, user } = await seedRegistration();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();

    await importOwnTags(registration.id, user.id, [
      { tag: "300", sex: "HEMBRA", category: "Vaca", birthDate: "8/7/2026", paddock: null, date: null },
    ]);

    const [stored] = await testDb.select().from(ownTag).where(eq(ownTag.tag, "300"));
    expect(stored).toMatchObject({ sex: "female", categoryId: vaca.id, birthDate: "2026-07-08" });
  });

  it("stores a month/year-only birth date (herd records rarely track the exact day)", async () => {
    const { registration, user } = await seedRegistration();

    await importOwnTags(registration.id, user.id, [
      { tag: "304", sex: null, category: null, birthDate: "01/2021", paddock: null, date: null },
    ]);

    const [stored] = await testDb.select().from(ownTag).where(eq(ownTag.tag, "304"));
    expect(stored.birthDate).toBe("2021-01-01");
  });

  it("leaves sex, category, and birth date null when unrecognized or unmapped", async () => {
    const { registration, user } = await seedRegistration();

    await importOwnTags(registration.id, user.id, [
      { tag: "301", sex: "???", category: "No existe", birthDate: null, paddock: null, date: null },
    ]);

    const [stored] = await testDb.select().from(ownTag).where(eq(ownTag.tag, "301"));
    expect(stored).toMatchObject({ sex: null, categoryId: null, birthDate: null });
  });

  it("fills in category on a re-upload for a tag already registered without it", async () => {
    const { registration, user } = await seedRegistration();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();

    // First upload: category column wasn't mapped.
    const first = await importOwnTags(registration.id, user.id, tagRows(["302"]));
    expect(first).toEqual({ inserted: 1, updated: 0, located: 0, recategorized: 0, skipped: 0, invalid: 0 });

    // Second upload: same tag, now with category mapped.
    const second = await importOwnTags(registration.id, user.id, [
      { tag: "302", sex: null, category: "Vaca", birthDate: null, paddock: null, date: null },
    ]);
    expect(second).toEqual({ inserted: 0, updated: 1, located: 0, recategorized: 0, skipped: 0, invalid: 0 });

    const [stored] = await testDb.select().from(ownTag).where(eq(ownTag.tag, "302"));
    expect(stored.categoryId).toBe(vaca.id);
  });

  it("does not overwrite an already-set field with a different value on re-upload", async () => {
    const { registration, user } = await seedRegistration();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [toro] = await testDb.insert(category).values({ name: "Toro" }).returning();

    await importOwnTags(registration.id, user.id, [
      { tag: "303", sex: null, category: "Vaca", birthDate: null, paddock: null, date: null },
    ]);
    await importOwnTags(registration.id, user.id, [
      { tag: "303", sex: null, category: "Toro", birthDate: null, paddock: null, date: null },
    ]);

    const [stored] = await testDb.select().from(ownTag).where(eq(ownTag.tag, "303"));
    expect(stored.categoryId).toBe(vaca.id);
    expect(stored.categoryId).not.toBe(toro.id);
  });

  it("does not create an animal when no paddock column is mapped (locate: false)", async () => {
    const { registration, user } = await seedRegistration();

    await importOwnTags(registration.id, user.id, tagRows(["400"]), { locate: false });

    const animals = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "400"));
    expect(animals).toHaveLength(0);
  });

  it("creates and locates an animal in the given paddock when locate: true", async () => {
    const { registration, user } = await seedRegistration();
    const [potrero] = await testDb.insert(paddock).values({ farmId: registration.farmId, name: "Potrero 1" }).returning();

    const result = await importOwnTags(
      registration.id,
      user.id,
      [{ tag: "500", sex: "MACHO", category: null, birthDate: null, paddock: "Potrero 1", date: "2026-01-15" }],
      { locate: true }
    );

    expect(result).toEqual({ inserted: 1, updated: 0, located: 1, recategorized: 0, skipped: 0, invalid: 0 });

    const [history] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "500"));
    expect(history).toBeDefined();
    const [createdAnimal] = await testDb.select().from(animal).where(eq(animal.id, history.animalId));
    expect(createdAnimal.sex).toBe("male");

    const state = await testDb.execute<{ current_paddock_id: string; current_farm_id: string }>(
      sql`select current_farm_id, current_paddock_id from animal_current_state where animal_id = ${history.animalId}`
    );
    expect(state.rows[0].current_farm_id).toBe(registration.farmId);
    expect(state.rows[0].current_paddock_id).toBe(potrero.id);
  });

  it("does NOT auto-create a missing paddock — leaves the animal farm-located without a paddock instead", async () => {
    const { registration, user } = await seedRegistration();

    await importOwnTags(
      registration.id,
      user.id,
      [{ tag: "501", sex: null, category: null, birthDate: null, paddock: "Potrero Nuevo", date: null }],
      { locate: true }
    );

    const [createdPaddock] = await testDb.select().from(paddock).where(eq(paddock.name, "Potrero Nuevo"));
    expect(createdPaddock).toBeUndefined();

    const [history] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "501"));
    const state = await testDb.execute<{ current_paddock_id: string | null; current_farm_id: string }>(
      sql`select current_farm_id, current_paddock_id from animal_current_state where animal_id = ${history.animalId}`
    );
    expect(state.rows[0].current_farm_id).toBe(registration.farmId);
    expect(state.rows[0].current_paddock_id).toBeNull();
  });

  it("locates a tag on re-upload that was registered earlier without a paddock column", async () => {
    const { registration, user } = await seedRegistration();
    const [potrero] = await testDb.insert(paddock).values({ farmId: registration.farmId, name: "Potrero 1" }).returning();

    await importOwnTags(registration.id, user.id, tagRows(["502"]), { locate: false });
    const result = await importOwnTags(
      registration.id,
      user.id,
      [{ tag: "502", sex: null, category: null, birthDate: null, paddock: "Potrero 1", date: null }],
      { locate: true }
    );

    expect(result).toEqual({ inserted: 0, updated: 0, located: 1, recategorized: 0, skipped: 1, invalid: 0 });

    const [history] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "502"));
    expect(history).toBeDefined();
    const state = await testDb.execute<{ current_paddock_id: string | null }>(
      sql`select current_paddock_id from animal_current_state where animal_id = ${history.animalId}`
    );
    expect(state.rows[0].current_paddock_id).toBe(potrero.id);
  });

  it("recategorizes an already-existing animal on re-upload when the category column is mapped later", async () => {
    const { registration, user } = await seedRegistration();
    const [potrero] = await testDb.insert(paddock).values({ farmId: registration.farmId, name: "Potrero 1" }).returning();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();

    // First upload: paddock mapped (creates the animal), category not mapped yet.
    const first = await importOwnTags(
      registration.id,
      user.id,
      [{ tag: "600", sex: null, category: null, birthDate: null, paddock: "Potrero 1", date: null }],
      { locate: true }
    );
    expect(first).toEqual({ inserted: 1, updated: 0, located: 1, recategorized: 0, skipped: 0, invalid: 0 });

    const [history] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "600"));
    const beforeState = await testDb.execute<{ current_category_id: string | null }>(
      sql`select current_category_id from animal_current_state where animal_id = ${history.animalId}`
    );
    expect(beforeState.rows[0].current_category_id).toBeNull();

    // Second upload: same tag, category now mapped — no paddock column this time.
    const second = await importOwnTags(registration.id, user.id, [
      { tag: "600", sex: null, category: "Vaca", birthDate: null, paddock: null, date: null },
    ]);
    expect(second).toEqual({ inserted: 0, updated: 1, located: 0, recategorized: 1, skipped: 0, invalid: 0 });

    const afterState = await testDb.execute<{ current_category_id: string | null; current_paddock_id: string | null }>(
      sql`select current_category_id, current_paddock_id from animal_current_state where animal_id = ${history.animalId}`
    );
    expect(afterState.rows[0].current_category_id).toBe(vaca.id);
    // Location from the first upload should be untouched.
    expect(afterState.rows[0].current_paddock_id).toBe(potrero.id);
  });

  it("backfills sex and birth date on an already-existing animal that didn't have them", async () => {
    const { registration, user } = await seedRegistration();

    await importOwnTags(
      registration.id,
      user.id,
      [{ tag: "601", sex: null, category: null, birthDate: null, paddock: "Potrero X", date: null }],
      { locate: true }
    );
    const [history] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "601"));
    const [beforeAnimal] = await testDb.select().from(animal).where(eq(animal.id, history.animalId));
    expect(beforeAnimal.sex).toBeNull();
    expect(beforeAnimal.birthDate).toBeNull();

    await importOwnTags(registration.id, user.id, [
      { tag: "601", sex: "HEMBRA", category: null, birthDate: "8/7/2026", paddock: null, date: null },
    ]);

    const [afterAnimal] = await testDb.select().from(animal).where(eq(animal.id, history.animalId));
    expect(afterAnimal.sex).toBe("female");
    expect(afterAnimal.birthDate).toBe("2026-07-08");
  });

  it("does not recategorize an animal that already has a category, even if the upload brings a different one", async () => {
    const { registration, user } = await seedRegistration();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [toro] = await testDb.insert(category).values({ name: "Toro" }).returning();

    await importOwnTags(
      registration.id,
      user.id,
      [{ tag: "602", sex: null, category: "Vaca", birthDate: null, paddock: "Potrero Y", date: null }],
      { locate: true }
    );
    const [history] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "602"));

    const result = await importOwnTags(registration.id, user.id, [
      { tag: "602", sex: null, category: "Toro", birthDate: null, paddock: null, date: null },
    ]);
    expect(result.recategorized).toBe(0);

    const state = await testDb.execute<{ current_category_id: string | null }>(
      sql`select current_category_id from animal_current_state where animal_id = ${history.animalId}`
    );
    expect(state.rows[0].current_category_id).toBe(vaca.id);
    expect(state.rows[0].current_category_id).not.toBe(toro.id);
  });
});

describe("findMissingPaddockNames", () => {
  it("returns only the names that don't exist yet for the registration's farm", async () => {
    const { registration } = await seedRegistration();
    await testDb.insert(paddock).values({ farmId: registration.farmId, name: "Potrero 1" });

    const missing = await findMissingPaddockNames(registration.id, ["Potrero 1", "Potrero 2", "potrero 1"]);

    expect(missing).toEqual(["Potrero 2"]);
  });
});

describe("findMissingCategoryNames", () => {
  it("returns only category names that don't exist yet, using exact match", async () => {
    await testDb.insert(category).values({ name: "Vaca" });

    const missing = await findMissingCategoryNames(["Vaca", "Toro", "vaca"]);

    expect(missing).toEqual(["Toro", "vaca"]);
  });
});

describe("countOwnTagsByRegistration", () => {
  it("counts imported tags per registration and tracks the last upload time", async () => {
    const { registration, user } = await seedRegistration();
    await importOwnTags(registration.id, user.id, tagRows(["100", "200"]));

    const counts = await countOwnTagsByRegistration();

    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ dicoseRegistrationId: registration.id, count: 2 });
    expect(counts[0].lastUploadedAt).toBeInstanceOf(Date);
  });
});
