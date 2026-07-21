import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { animal, animalTagHistory } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("animal table", () => {
  it("stores an animal with a nullable birth date and no state columns", async () => {
    const [created] = await testDb.insert(animal).values({}).returning();
    expect(created.birthDate).toBeNull();
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created).not.toHaveProperty("currentFarmId");
    expect(created).not.toHaveProperty("status");
  });
});

describe("animal_tag_history table", () => {
  it("links a tag to an animal and requires a tag value", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    const [tagRow] = await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR123456789012" })
      .returning();
    expect(tagRow.tag).toBe("AR123456789012");
    expect(tagRow.validFrom).toBeInstanceOf(Date);

    await expect(
      testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: null as unknown as string })
    ).rejects.toThrow();
  });
});
