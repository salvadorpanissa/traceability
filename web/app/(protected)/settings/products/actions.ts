"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess, requireFarmAccess, getEstablishmentFarmId } from "@/lib/dal/farm-access";
import { createProduct, updateProduct, getProductFarmId, type ProductCatalogEntry } from "@/lib/dal/product-catalog";
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
  establishmentId: string;
  name: string;
  defaultDose: string | null;
  defaultDoseUnit: string | null;
  defaultRoute: string | null;
  defaultWithdrawalDays: number | null;
}): Promise<ProductCatalogActionResult> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.establishmentId);
  const farmId = await getEstablishmentFarmId(input.establishmentId);
  if (!farmId) return { ok: false, error: "Campo no encontrado" };

  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await createProduct(farmId, parsed.data.name, {
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
  const session = await requireSession();
  const farmId = await getProductFarmId(input.id);
  if (!farmId) return { ok: false, error: "Producto no encontrado" };
  await requireFarmAccess(session.user.id, session.user.role, farmId);

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
