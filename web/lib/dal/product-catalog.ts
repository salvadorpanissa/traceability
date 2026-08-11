import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { product } from "@/db/schema";

export type ProductCatalogEntry = {
  id: string;
  name: string;
  defaultDose: string | null;
  defaultDoseUnit: string | null;
  defaultRoute: string | null;
  defaultWithdrawalDays: number | null;
};

export async function listProducts(): Promise<ProductCatalogEntry[]> {
  return db
    .select({
      id: product.id,
      name: product.name,
      defaultDose: product.defaultDose,
      defaultDoseUnit: product.defaultDoseUnit,
      defaultRoute: product.defaultRoute,
      defaultWithdrawalDays: product.defaultWithdrawalDays,
    })
    .from(product)
    .orderBy(asc(product.name));
}

export async function createProduct(
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
      name,
      defaultDose: options?.defaultDose ?? null,
      defaultDoseUnit: options?.defaultDoseUnit ?? null,
      defaultRoute: options?.defaultRoute ?? null,
      defaultWithdrawalDays: options?.defaultWithdrawalDays ?? null,
    })
    .returning();
  return {
    id: created.id,
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
    name: updated.name,
    defaultDose: updated.defaultDose,
    defaultDoseUnit: updated.defaultDoseUnit,
    defaultRoute: updated.defaultRoute,
    defaultWithdrawalDays: updated.defaultWithdrawalDays,
  };
}
