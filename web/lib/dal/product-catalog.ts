import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { product } from "@/db/schema";

export type ProductCatalogEntry = {
  id: string;
  name: string;
  defaultDoseUnit: string | null;
  defaultWithdrawalDays: number | null;
};

export async function listProducts(): Promise<ProductCatalogEntry[]> {
  return db
    .select({
      id: product.id,
      name: product.name,
      defaultDoseUnit: product.defaultDoseUnit,
      defaultWithdrawalDays: product.defaultWithdrawalDays,
    })
    .from(product)
    .orderBy(asc(product.name));
}

export async function createProduct(
  name: string,
  options?: { defaultDoseUnit?: string | null; defaultWithdrawalDays?: number | null }
): Promise<ProductCatalogEntry> {
  const [created] = await db
    .insert(product)
    .values({
      name,
      defaultDoseUnit: options?.defaultDoseUnit ?? null,
      defaultWithdrawalDays: options?.defaultWithdrawalDays ?? null,
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    defaultDoseUnit: created.defaultDoseUnit,
    defaultWithdrawalDays: created.defaultWithdrawalDays,
  };
}

export async function updateProduct(
  id: string,
  input: { name: string; defaultDoseUnit?: string | null; defaultWithdrawalDays?: number | null }
): Promise<ProductCatalogEntry> {
  const [updated] = await db
    .update(product)
    .set({
      name: input.name,
      defaultDoseUnit: input.defaultDoseUnit ?? null,
      defaultWithdrawalDays: input.defaultWithdrawalDays ?? null,
    })
    .where(eq(product.id, id))
    .returning();
  return {
    id: updated.id,
    name: updated.name,
    defaultDoseUnit: updated.defaultDoseUnit,
    defaultWithdrawalDays: updated.defaultWithdrawalDays,
  };
}
