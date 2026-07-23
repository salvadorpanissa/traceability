import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { category } from "@/db/schema";

export type CategoryCatalogEntry = {
  id: string;
  name: string;
  sortOrder: number;
};

export async function listCategories(): Promise<CategoryCatalogEntry[]> {
  return db
    .select({ id: category.id, name: category.name, sortOrder: category.sortOrder })
    .from(category)
    .orderBy(asc(category.sortOrder));
}

export async function createCategory(name: string, sortOrder?: number): Promise<CategoryCatalogEntry> {
  const [created] = await db
    .insert(category)
    .values(sortOrder === undefined ? { name } : { name, sortOrder })
    .returning();
  return { id: created.id, name: created.name, sortOrder: created.sortOrder };
}

export async function updateCategory(
  id: string,
  input: { name: string; sortOrder: number }
): Promise<CategoryCatalogEntry> {
  const [updated] = await db
    .update(category)
    .set({ name: input.name, sortOrder: input.sortOrder })
    .where(eq(category.id, id))
    .returning();
  return { id: updated.id, name: updated.name, sortOrder: updated.sortOrder };
}
