"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { createProduct, updateProduct, type ProductCatalogEntry } from "@/lib/dal/product-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type ProductCatalogActionResult = { ok: true; entry: ProductCatalogEntry } | { ok: false; error: string };

const productInputSchema = z.object({
  name: z.string().trim().min(1),
  defaultDose: z.string().trim().min(1).nullable(),
  defaultDoseUnit: z.string().trim().min(1).nullable(),
  defaultRoute: z.string().trim().min(1).nullable(),
  defaultWithdrawalDays: z.number().int().min(0).nullable(),
});

export async function createProductAction(input: {
  name: string;
  defaultDose: string | null;
  defaultDoseUnit: string | null;
  defaultRoute: string | null;
  defaultWithdrawalDays: number | null;
}): Promise<ProductCatalogActionResult> {
  await requireSession();
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await createProduct(parsed.data.name, {
      defaultDose: parsed.data.defaultDose,
      defaultDoseUnit: parsed.data.defaultDoseUnit,
      defaultRoute: parsed.data.defaultRoute,
      defaultWithdrawalDays: parsed.data.defaultWithdrawalDays,
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
  defaultDose: string | null;
  defaultDoseUnit: string | null;
  defaultRoute: string | null;
  defaultWithdrawalDays: number | null;
}): Promise<ProductCatalogActionResult> {
  await requireSession();
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await updateProduct(input.id, parsed.data);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un producto con ese nombre" };
    throw error;
  }
}
