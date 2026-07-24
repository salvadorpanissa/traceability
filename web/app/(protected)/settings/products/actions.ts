"use server";

import { requireSession } from "@/lib/dal/session";
import { createProduct, updateProduct, type ProductCatalogEntry } from "@/lib/dal/product-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type ProductCatalogActionResult = { ok: true; entry: ProductCatalogEntry } | { ok: false; error: string };

export async function createProductAction(input: {
  name: string;
  defaultDoseUnit: string | null;
  defaultWithdrawalDays: number | null;
}): Promise<ProductCatalogActionResult> {
  await requireSession();
  try {
    const entry = await createProduct(input.name, {
      defaultDoseUnit: input.defaultDoseUnit,
      defaultWithdrawalDays: input.defaultWithdrawalDays,
    });
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un producto con ese nombre" };
    throw error;
  }
}

export async function updateProductAction(input: {
  id: string;
  name: string;
  defaultDoseUnit: string | null;
  defaultWithdrawalDays: number | null;
}): Promise<ProductCatalogActionResult> {
  await requireSession();
  try {
    const entry = await updateProduct(input.id, input);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un producto con ese nombre" };
    throw error;
  }
}
