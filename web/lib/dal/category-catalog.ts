import { asc } from "drizzle-orm";
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

export async function createCategory(name: string): Promise<CategoryCatalogEntry> {
  const [created] = await db.insert(category).values({ name }).returning();
  return { id: created.id, name: created.name, sortOrder: created.sortOrder };
}
