import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, owner, dicoseRegistration } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { importOwnTags, countOwnTagsByRegistration } = await import("@/lib/dal/own-tag");

beforeEach(async () => {
  await resetTestDb();
});

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

    const result = await importOwnTags(registration.id, user.id, ["100", "", "abc", "  200  "]);

    expect(result).toEqual({ inserted: 2, skipped: 0, invalid: 1 });
  });

  it("ignores duplicates within the same file and against already-imported tags", async () => {
    const { registration, user } = await seedRegistration();
    await importOwnTags(registration.id, user.id, ["100"]);

    const result = await importOwnTags(registration.id, user.id, ["100", "100", "200"]);

    expect(result).toEqual({ inserted: 1, skipped: 2, invalid: 0 });
  });
});

describe("countOwnTagsByRegistration", () => {
  it("counts imported tags per registration and tracks the last upload time", async () => {
    const { registration, user } = await seedRegistration();
    await importOwnTags(registration.id, user.id, ["100", "200"]);

    const counts = await countOwnTagsByRegistration();

    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ dicoseRegistrationId: registration.id, count: 2 });
    expect(counts[0].lastUploadedAt).toBeInstanceOf(Date);
  });
});
