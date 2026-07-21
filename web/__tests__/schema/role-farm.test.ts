import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("role table", () => {
  it("stores a role and enforces unique names", async () => {
    await testDb.insert(role).values({ name: "admin" });
    const rows = await testDb.select().from(role);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("admin");

    await expect(testDb.insert(role).values({ name: "admin" })).rejects.toThrow();
  });
});

describe("farm table", () => {
  it("stores a farm with optional DICOSE/RUC", async () => {
    await testDb.insert(farm).values({ name: "Campo Norte" });
    const rows = await testDb.select().from(farm);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Campo Norte");
    expect(rows[0].dicoseCode).toBeNull();
    expect(rows[0].ruc).toBeNull();
  });
});
