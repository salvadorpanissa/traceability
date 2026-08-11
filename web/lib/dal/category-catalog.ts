import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { category } from "@/db/schema";

export type CategoryCatalogEntry = {
  id: string;
  groupId: string;
  name: string;
  sex: "male" | "female" | null;
  minAgeMonths: number | null;
  active: boolean;
};

const CATEGORY_COLUMNS = {
  id: category.id,
  groupId: category.groupId,
  name: category.name,
  sex: category.sex,
  minAgeMonths: category.minAgeMonths,
  active: category.active,
};

// Active categories only — what every picker that assigns a category going
// forward (manual recategorize, imports) should offer. An archived category
// still exists (its historical events still reference it) but shouldn't be
// chosen for new assignments.
export async function listCategoriesByGroup(groupId: string): Promise<CategoryCatalogEntry[]> {
  return db
    .select(CATEGORY_COLUMNS)
    .from(category)
    .where(sql`${category.groupId} = ${groupId} and ${category.active} = true`)
    .orderBy(asc(category.name));
}

// Every category regardless of active state — only the settings management
// page needs this, to show archived categories alongside active ones.
export async function listAllCategoriesByGroup(groupId: string): Promise<CategoryCatalogEntry[]> {
  return db.select(CATEGORY_COLUMNS).from(category).where(eq(category.groupId, groupId)).orderBy(asc(category.name));
}

// Every category (any active state) across a set of grupos — an admin can
// reach more than one grupo, so the settings page lists them all together.
export async function listAllCategoriesForGroups(groupIds: string[]): Promise<CategoryCatalogEntry[]> {
  if (groupIds.length === 0) return [];
  return db.select(CATEGORY_COLUMNS).from(category).where(inArray(category.groupId, groupIds)).orderBy(asc(category.name));
}

export async function getCategoryGroupId(id: string): Promise<string | null> {
  const [row] = await db.select({ groupId: category.groupId }).from(category).where(eq(category.id, id));
  return row?.groupId ?? null;
}

export async function createCategory(
  groupId: string,
  input: {
    name: string;
    sex?: "male" | "female" | null;
    minAgeMonths?: number | null;
  }
): Promise<CategoryCatalogEntry> {
  const [created] = await db
    .insert(category)
    .values({
      groupId,
      name: input.name,
      sex: input.sex ?? null,
      minAgeMonths: input.minAgeMonths ?? null,
    })
    .returning();
  return {
    id: created.id,
    groupId: created.groupId,
    name: created.name,
    sex: created.sex,
    minAgeMonths: created.minAgeMonths,
    active: created.active,
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
    groupId: updated.groupId,
    name: updated.name,
    sex: updated.sex,
    minAgeMonths: updated.minAgeMonths,
    active: updated.active,
  };
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  await db.update(category).set({ active }).where(eq(category.id, id));
}

// How many currently-alive animals sit in each category right now — used by
// the settings page to warn before archiving ("there are N animals in this
// category") without a separate round trip per category.
export async function countAliveAnimalsByCategory(): Promise<Map<string, number>> {
  const result = await db.execute<{ current_category_id: string; count: string }>(sql`
    select current_category_id, count(*)::int as count
    from animal_current_state
    where status = 'alive' and current_category_id is not null
    group by current_category_id
  `);
  return new Map(result.rows.map((row) => [row.current_category_id, Number(row.count)]));
}
