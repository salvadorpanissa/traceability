"use server";

import { requireSession } from "@/lib/dal/session";
import { createCategory, updateCategory, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type CategoryCatalogActionResult = { ok: true; entry: CategoryCatalogEntry } | { ok: false; error: string };

export async function createCategoryAction(input: {
  name: string;
  sortOrder: number;
}): Promise<CategoryCatalogActionResult> {
  await requireSession();
  try {
    const entry = await createCategory(input.name, input.sortOrder);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe una categoría con ese nombre" };
    throw error;
  }
}

export async function updateCategoryAction(input: {
  id: string;
  name: string;
  sortOrder: number;
}): Promise<CategoryCatalogActionResult> {
  await requireSession();
  try {
    const entry = await updateCategory(input.id, input);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe una categoría con ese nombre" };
    throw error;
  }
}
