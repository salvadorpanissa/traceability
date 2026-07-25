import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { category, product } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("category table", () => {
  it("stores a category with a unique name", async () => {
    const [created] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    expect(created.name).toBe("Vaca");

    await expect(testDb.insert(category).values({ name: "Vaca" })).rejects.toThrow();
  });
});

describe("product table", () => {
  it("stores a product with optional dose unit and withdrawal days", async () => {
    const [created] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    expect(created.name).toBe("Ivermectina 1%");
    expect(created.defaultDoseUnit).toBeNull();
    expect(created.defaultWithdrawalDays).toBeNull();
  });
});
