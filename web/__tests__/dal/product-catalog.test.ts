import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listProductsByFarm, listProductsForFarms, createProduct, updateProduct } = await import(
  "@/lib/dal/product-catalog"
);

beforeEach(async () => {
  await resetTestDb();
});

async function seedGroup(name = "Grupo") {
  const [group] = await testDb.insert(farm).values({ name }).returning();
  return group;
}

describe("listProductsByFarm", () => {
  it("lists every product in the grupo ordered by name, with defaults", async () => {
    const group = await seedGroup();
    await testDb.insert(product).values([
      { farmId: group.id, name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
      { farmId: group.id, name: "Aftosa" },
    ]);

    const products = await listProductsByFarm(group.id);

    expect(products).toEqual([
      {
        id: expect.any(String),
        farmId: group.id,
        name: "Aftosa",
        defaultDose: null,
        defaultDoseUnit: null,
        defaultRoute: null,
        defaultWithdrawalDays: null,
      },
      {
        id: expect.any(String),
        farmId: group.id,
        name: "Ivermectina 1%",
        defaultDose: null,
        defaultDoseUnit: "ml",
        defaultRoute: null,
        defaultWithdrawalDays: 21,
      },
    ]);
  });

  it("does not include a product from a different grupo", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await testDb.insert(product).values({ farmId: groupB.id, name: "Aftosa" });

    expect(await listProductsByFarm(groupA.id)).toEqual([]);
  });
});

describe("listProductsForFarms", () => {
  it("lists products across every grupo given", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await testDb.insert(product).values([
      { farmId: groupA.id, name: "Aftosa" },
      { farmId: groupB.id, name: "Ivermectina 1%" },
    ]);

    const products = await listProductsForFarms([groupA.id, groupB.id]);

    expect(products.map((p) => p.name)).toEqual(["Aftosa", "Ivermectina 1%"]);
  });
});

describe("createProduct", () => {
  it("creates a product with only a name, defaults left null", async () => {
    const group = await seedGroup();
    const created = await createProduct(group.id, "Ivermectina 1%");

    expect(created.name).toBe("Ivermectina 1%");
    expect(created.farmId).toBe(group.id);
    expect(created.defaultDose).toBeNull();
    expect(created.defaultDoseUnit).toBeNull();
    expect(created.defaultRoute).toBeNull();
    expect(created.defaultWithdrawalDays).toBeNull();

    const [stored] = await testDb.select().from(product).where(eq(product.id, created.id));
    expect(stored.name).toBe("Ivermectina 1%");
  });

  it("creates a product with a dose, dose unit, route and withdrawal days", async () => {
    const group = await seedGroup();
    const created = await createProduct(group.id, "Aftosa", {
      defaultDose: "10",
      defaultDoseUnit: "cc",
      defaultRoute: "subcutánea",
      defaultWithdrawalDays: 45,
    });

    expect(created).toEqual({
      id: expect.any(String),
      farmId: group.id,
      name: "Aftosa",
      defaultDose: "10",
      defaultDoseUnit: "cc",
      defaultRoute: "subcutánea",
      defaultWithdrawalDays: 45,
    });
  });

  it("rejects a duplicate name within the same grupo", async () => {
    const group = await seedGroup();
    await createProduct(group.id, "Aftosa");
    await expect(createProduct(group.id, "Aftosa")).rejects.toThrow();
  });

  it("allows the same name in a different grupo", async () => {
    const groupA = await seedGroup("A");
    const groupB = await seedGroup("B");
    await createProduct(groupA.id, "Aftosa");

    const created = await createProduct(groupB.id, "Aftosa");
    expect(created.name).toBe("Aftosa");
  });
});

describe("updateProduct", () => {
  it("updates name, dose, dose unit, route, and withdrawal days", async () => {
    const group = await seedGroup();
    const created = await createProduct(group.id, "Ivermectina 1%", {
      defaultDose: "5",
      defaultDoseUnit: "ml",
      defaultRoute: "intramuscular",
      defaultWithdrawalDays: 21,
    });

    const updated = await updateProduct(created.id, {
      name: "Ivermectina 1% inyectable",
      defaultDose: "10",
      defaultDoseUnit: "cc",
      defaultRoute: "subcutánea",
      defaultWithdrawalDays: 30,
    });

    expect(updated).toEqual({
      id: created.id,
      farmId: group.id,
      name: "Ivermectina 1% inyectable",
      defaultDose: "10",
      defaultDoseUnit: "cc",
      defaultRoute: "subcutánea",
      defaultWithdrawalDays: 30,
    });
  });

  it("clears dose, dose unit, route, and withdrawal days when omitted", async () => {
    const group = await seedGroup();
    const created = await createProduct(group.id, "Aftosa", {
      defaultDose: "10",
      defaultDoseUnit: "cc",
      defaultRoute: "subcutánea",
      defaultWithdrawalDays: 45,
    });

    const updated = await updateProduct(created.id, { name: "Aftosa" });

    expect(updated.defaultDose).toBeNull();
    expect(updated.defaultDoseUnit).toBeNull();
    expect(updated.defaultRoute).toBeNull();
    expect(updated.defaultWithdrawalDays).toBeNull();
  });

  it("rejects renaming into a name that already exists in the same grupo", async () => {
    const group = await seedGroup();
    await createProduct(group.id, "Aftosa");
    const created = await createProduct(group.id, "Ivermectina 1%");

    await expect(updateProduct(created.id, { name: "Aftosa" })).rejects.toThrow();
  });
});
