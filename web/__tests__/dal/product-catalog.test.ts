import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listProducts, createProduct } = await import("@/lib/dal/product-catalog");

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

describe("createProduct", () => {
  it("creates a product with only a name, defaults left null", async () => {
    const created = await createProduct("Ivermectina 1%");

    expect(created.name).toBe("Ivermectina 1%");
    expect(created.defaultDoseUnit).toBeNull();
    expect(created.defaultWithdrawalDays).toBeNull();

    const [stored] = await testDb.select().from(product).where(eq(product.id, created.id));
    expect(stored.name).toBe("Ivermectina 1%");
  });

  it("rejects a duplicate name", async () => {
    await createProduct("Aftosa");
    await expect(createProduct("Aftosa")).rejects.toThrow();
  });
});
