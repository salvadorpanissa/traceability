import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { animal, animalTagHistory } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { gapFillBreed, gapFillSecondaryTag } = await import("@/lib/activities/gap-fill");

beforeEach(async () => {
  await resetTestDb();
});

describe("gapFillBreed", () => {
  it("sets breed when the animal has none", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    await testDb.transaction((tx) => gapFillBreed(tx, createdAnimal.id, "Angus"));

    const [updated] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(updated.breed).toBe("Angus");
  });

  it("does not overwrite an existing breed", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({ breed: "Hereford" }).returning();

    await testDb.transaction((tx) => gapFillBreed(tx, createdAnimal.id, "Angus"));

    const [updated] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(updated.breed).toBe("Hereford");
  });

  it("does nothing when no breed is provided", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    await testDb.transaction((tx) => gapFillBreed(tx, createdAnimal.id, null));

    const [updated] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(updated.breed).toBeNull();
  });
});

describe("gapFillSecondaryTag", () => {
  it("sets the secondary tag on the animal's current tag-history row", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [tagRow] = await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR1" })
      .returning();

    await testDb.transaction((tx) => gapFillSecondaryTag(tx, createdAnimal.id, "CHIP1"));

    const [updated] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.id, tagRow.id));
    expect(updated.secondaryTag).toBe("CHIP1");
    expect(updated.tag).toBe("AR1");
  });

  it("does not overwrite an existing secondary tag", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [tagRow] = await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR2", secondaryTag: "CHIP-OLD" })
      .returning();

    await testDb.transaction((tx) => gapFillSecondaryTag(tx, createdAnimal.id, "CHIP-NEW"));

    const [updated] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.id, tagRow.id));
    expect(updated.secondaryTag).toBe("CHIP-OLD");
  });

  it("updates the most recent tag-history row when the animal has been retagged", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [oldTagRow] = await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR3", validFrom: new Date("2020-01-01") })
      .returning();
    const [newTagRow] = await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR3-NEW", validFrom: new Date("2026-01-01") })
      .returning();

    await testDb.transaction((tx) => gapFillSecondaryTag(tx, createdAnimal.id, "CHIP1"));

    const [updatedOld] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.id, oldTagRow.id));
    const [updatedNew] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.id, newTagRow.id));
    expect(updatedOld.secondaryTag).toBeNull();
    expect(updatedNew.secondaryTag).toBe("CHIP1");
  });
});
