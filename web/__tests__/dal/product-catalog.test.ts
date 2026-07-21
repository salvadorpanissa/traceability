import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listProducts } = await import("@/lib/dal/product-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listProducts", () => {
  it("lists every product ordered by name, with defaults", async () => {
    await testDb.insert(product).values([
      { name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
      { name: "Aftosa" },
    ]);

    const products = await listProducts();

    expect(products).toEqual([
      { id: expect.any(String), name: "Aftosa", defaultDoseUnit: null, defaultWithdrawalDays: null },
      { id: expect.any(String), name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
    ]);
  });
});
