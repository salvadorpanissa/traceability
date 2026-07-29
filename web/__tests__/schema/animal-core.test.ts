import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { animal, animalTagHistory } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("animal table", () => {
  it("stores an animal with a nullable birth date, breed, and no state columns", async () => {
    const [created] = await testDb.insert(animal).values({}).returning();
    expect(created.birthDate).toBeNull();
    expect(created.breed).toBeNull();
    expect(created).not.toHaveProperty("createdAt");
    expect(created).not.toHaveProperty("currentFarmId");
    expect(created).not.toHaveProperty("status");
  });
});

describe("animal_tag_history table", () => {
  it("links a tag to an animal, requires a tag value, and allows a nullable secondary tag", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    const [tagRow] = await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR123456789012" })
      .returning();
    expect(tagRow.tag).toBe("AR123456789012");
    expect(tagRow.secondaryTag).toBeNull();
    expect(tagRow.validFrom).toBeInstanceOf(Date);

    await expect(
      testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: null as unknown as string })
    ).rejects.toThrow();
  });

  it("rejects a secondary tag that's already used by a different animal", async () => {
    const [animalOne] = await testDb.insert(animal).values({}).returning();
    const [animalTwo] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: animalOne.id, tag: "AR1", secondaryTag: "CHIP1" });

    await expect(
      testDb.insert(animalTagHistory).values({ animalId: animalTwo.id, tag: "AR2", secondaryTag: "CHIP1" })
    ).rejects.toThrow();
  });
});
