import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { category, product, farmGroup } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("category table", () => {
  it("stores a category with a name unique within its grupo", async () => {
    const [group] = await testDb.insert(farmGroup).values({ name: "Grupo" }).returning();
    const [created] = await testDb.insert(category).values({ groupId: group.id, name: "Vaca" }).returning();
    expect(created.name).toBe("Vaca");

    await expect(testDb.insert(category).values({ groupId: group.id, name: "Vaca" })).rejects.toThrow();
  });

  it("allows the same name in a different grupo", async () => {
    const [groupA] = await testDb.insert(farmGroup).values({ name: "Grupo A" }).returning();
    const [groupB] = await testDb.insert(farmGroup).values({ name: "Grupo B" }).returning();
    await testDb.insert(category).values({ groupId: groupA.id, name: "Vaca" });

    const [created] = await testDb.insert(category).values({ groupId: groupB.id, name: "Vaca" }).returning();
    expect(created.name).toBe("Vaca");
  });
});

describe("product table", () => {
  it("stores a product with optional dose unit and withdrawal days", async () => {
    const [group] = await testDb.insert(farmGroup).values({ name: "Grupo" }).returning();
    const [created] = await testDb.insert(product).values({ groupId: group.id, name: "Ivermectina 1%" }).returning();
    expect(created.name).toBe("Ivermectina 1%");
    expect(created.defaultDoseUnit).toBeNull();
    expect(created.defaultWithdrawalDays).toBeNull();
  });
});
