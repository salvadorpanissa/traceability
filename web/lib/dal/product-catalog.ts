import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { product } from "@/db/schema";

export type ProductCatalogEntry = {
  id: string;
  groupId: string;
  name: string;
  defaultDose: string | null;
  defaultDoseUnit: string | null;
  defaultRoute: string | null;
  defaultWithdrawalDays: number | null;
};

const PRODUCT_COLUMNS = {
  id: product.id,
  groupId: product.groupId,
  name: product.name,
  defaultDose: product.defaultDose,
  defaultDoseUnit: product.defaultDoseUnit,
  defaultRoute: product.defaultRoute,
  defaultWithdrawalDays: product.defaultWithdrawalDays,
};

export async function listProductsByGroup(groupId: string): Promise<ProductCatalogEntry[]> {
  return db.select(PRODUCT_COLUMNS).from(product).where(eq(product.groupId, groupId)).orderBy(asc(product.name));
}

// Every product across a set of grupos — an admin can reach more than one
// grupo, so the settings page and sanidad's catalog list them all together.
export async function listProductsForGroups(groupIds: string[]): Promise<ProductCatalogEntry[]> {
  if (groupIds.length === 0) return [];
  return db.select(PRODUCT_COLUMNS).from(product).where(inArray(product.groupId, groupIds)).orderBy(asc(product.name));
}

export async function getProductGroupId(id: string): Promise<string | null> {
  const [row] = await db.select({ groupId: product.groupId }).from(product).where(eq(product.id, id));
  return row?.groupId ?? null;
}

export async function createProduct(
  groupId: string,
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
      groupId,
      name,
      defaultDose: options?.defaultDose ?? null,
      defaultDoseUnit: options?.defaultDoseUnit ?? null,
      defaultRoute: options?.defaultRoute ?? null,
      defaultWithdrawalDays: options?.defaultWithdrawalDays ?? null,
    })
    .returning();
  return {
    id: created.id,
    groupId: created.groupId,
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
    groupId: updated.groupId,
    name: updated.name,
    defaultDose: updated.defaultDose,
    defaultDoseUnit: updated.defaultDoseUnit,
    defaultRoute: updated.defaultRoute,
    defaultWithdrawalDays: updated.defaultWithdrawalDays,
  };
}
