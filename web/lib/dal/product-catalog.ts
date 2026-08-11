import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { product } from "@/db/schema";

export type ProductCatalogEntry = {
  id: string;
  farmId: string;
  name: string;
  defaultDose: string | null;
  defaultDoseUnit: string | null;
  defaultRoute: string | null;
  defaultWithdrawalDays: number | null;
};

const PRODUCT_COLUMNS = {
  id: product.id,
  farmId: product.farmId,
  name: product.name,
  defaultDose: product.defaultDose,
  defaultDoseUnit: product.defaultDoseUnit,
  defaultRoute: product.defaultRoute,
  defaultWithdrawalDays: product.defaultWithdrawalDays,
};

export async function listProductsByFarm(farmId: string): Promise<ProductCatalogEntry[]> {
  return db.select(PRODUCT_COLUMNS).from(product).where(eq(product.farmId, farmId)).orderBy(asc(product.name));
}

// Every product across a set of farms — an admin can reach more than one
// farm, so the settings page and sanidad's catalog list them all together.
export async function listProductsForFarms(farmIds: string[]): Promise<ProductCatalogEntry[]> {
  if (farmIds.length === 0) return [];
  return db.select(PRODUCT_COLUMNS).from(product).where(inArray(product.farmId, farmIds)).orderBy(asc(product.name));
}

export async function getProductFarmId(id: string): Promise<string | null> {
  const [row] = await db.select({ farmId: product.farmId }).from(product).where(eq(product.id, id));
  return row?.farmId ?? null;
}

export async function createProduct(
  farmId: string,
  name: string,
  options?: {
    defaultDose?: string | null;
    defaultDoseUnit?: string | null;
    defaultRoute?: string | null;
    defaultWithdrawalDays?: number | null;
  }
): Promise<ProductCatalogEntry> {
  const [created] = await db
    .insert(product)
    .values({
      farmId,
      name,
      defaultDose: options?.defaultDose ?? null,
      defaultDoseUnit: options?.defaultDoseUnit ?? null,
      defaultRoute: options?.defaultRoute ?? null,
      defaultWithdrawalDays: options?.defaultWithdrawalDays ?? null,
    })
    .returning();
  return {
    id: created.id,
    farmId: created.farmId,
    name: created.name,
    defaultDose: created.defaultDose,
    defaultDoseUnit: created.defaultDoseUnit,
    defaultRoute: created.defaultRoute,
    defaultWithdrawalDays: created.defaultWithdrawalDays,
  };
}

export async function updateProduct(
  id: string,
  input: {
    name: string;
    defaultDose?: string | null;
    defaultDoseUnit?: string | null;
    defaultRoute?: string | null;
    defaultWithdrawalDays?: number | null;
  }
): Promise<ProductCatalogEntry> {
  const [updated] = await db
    .update(product)
    .set({
      name: input.name,
      defaultDose: input.defaultDose ?? null,
      defaultDoseUnit: input.defaultDoseUnit ?? null,
      defaultRoute: input.defaultRoute ?? null,
      defaultWithdrawalDays: input.defaultWithdrawalDays ?? null,
    })
    .where(eq(product.id, id))
    .returning();
  return {
    id: updated.id,
    farmId: updated.farmId,
    name: updated.name,
    defaultDose: updated.defaultDose,
    defaultDoseUnit: updated.defaultDoseUnit,
    defaultRoute: updated.defaultRoute,
    defaultWithdrawalDays: updated.defaultWithdrawalDays,
  };
}
