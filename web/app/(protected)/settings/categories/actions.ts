"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { createCategory, updateCategory, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";
import { archiveCategory } from "@/lib/activities/category-archive";

export type CategoryCatalogActionResult = { ok: true; entry: CategoryCatalogEntry } | { ok: false; error: string };

const categoryInputSchema = z.object({
  name: z.string().trim().min(1),
  sex: z.enum(["male", "female"]).nullish(),
  minAgeMonths: z.number().int().min(0).nullish(),
});

export async function createCategoryAction(input: {
  name: string;
  sex?: "male" | "female" | null;
  minAgeMonths?: number | null;
}): Promise<CategoryCatalogActionResult> {
  await requireSession();
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await createCategory(parsed.data);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe una categoría con ese nombre" };
    throw error;
  }
}

export async function updateCategoryAction(input: {
  id: string;
  name: string;
  sex?: "male" | "female" | null;
  minAgeMonths?: number | null;
}): Promise<CategoryCatalogActionResult> {
  await requireSession();
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await updateCategory(input.id, parsed.data);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe una categoría con ese nombre" };
    throw error;
  }
}

export type ArchiveCategoryResult = { ok: true; reassigned: number } | { ok: false; error: string };

export async function archiveCategoryAction(input: {
  categoryId: string;
  targetCategoryId: string | null;
}): Promise<ArchiveCategoryResult> {
  const session = await requireSession();
  try {
    const { reassigned } = await archiveCategory({
      userId: session.user.id,
      categoryId: input.categoryId,
      targetCategoryId: input.targetCategoryId,
    });
    return { ok: true, reassigned };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo archivar la categoría" };
  }
}
