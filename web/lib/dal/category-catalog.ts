import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { category } from "@/db/schema";

export type CategoryCatalogEntry = {
  id: string;
  name: string;
  sex: "male" | "female" | null;
  minAgeMonths: number | null;
};

export async function listCategories(): Promise<CategoryCatalogEntry[]> {
  return db
    .select({
      id: category.id,
      name: category.name,
      sex: category.sex,
      minAgeMonths: category.minAgeMonths,
    })
    .from(category)
    .orderBy(asc(category.name));
}

export async function createCategory(input: {
  name: string;
  sex?: "male" | "female" | null;
  minAgeMonths?: number | null;
}): Promise<CategoryCatalogEntry> {
  const [created] = await db
    .insert(category)
    .values({
      name: input.name,
      sex: input.sex ?? null,
      minAgeMonths: input.minAgeMonths ?? null,
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    sex: created.sex,
    minAgeMonths: created.minAgeMonths,
  };
}

export async function updateCategory(
  id: string,
  input: { name: string; sex?: "male" | "female" | null; minAgeMonths?: number | null }
): Promise<CategoryCatalogEntry> {
  const [updated] = await db
    .update(category)
    .set({
      name: input.name,
      sex: input.sex ?? null,
      minAgeMonths: input.minAgeMonths ?? null,
    })
    .where(eq(category.id, id))
    .returning();
  return {
    id: updated.id,
    name: updated.name,
    sex: updated.sex,
    minAgeMonths: updated.minAgeMonths,
  };
}
