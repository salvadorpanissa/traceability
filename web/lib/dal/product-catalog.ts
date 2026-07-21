import { asc } from "drizzle-orm";
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

export async function createProduct(name: string): Promise<ProductCatalogEntry> {
  const [created] = await db.insert(product).values({ name }).returning();
  return {
    id: created.id,
    name: created.name,
    defaultDoseUnit: created.defaultDoseUnit,
    defaultWithdrawalDays: created.defaultWithdrawalDays,
  };
}
