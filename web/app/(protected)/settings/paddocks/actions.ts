"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { createPaddock, updatePaddock, getPaddockFarmId, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type PaddockCatalogActionResult = { ok: true; entry: PaddockCatalogEntry } | { ok: false; error: string };

const nameSchema = z.string().trim().min(1);

export async function createPaddockAction(input: {
  farmId: string;
  name: string;
}): Promise<PaddockCatalogActionResult> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, input.farmId);
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await createPaddock(input.farmId, name.data);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un potrero con ese nombre en ese campo" };
    throw error;
  }
}

export async function updatePaddockAction(input: {
  id: string;
  name: string;
}): Promise<PaddockCatalogActionResult> {
  const session = await requireSession();
  const farmId = await getPaddockFarmId(input.id);
  if (!farmId) return { ok: false, error: "Potrero no encontrado" };
  await requireFarmAccess(session.user.id, session.user.role, farmId);
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await updatePaddock(input.id, name.data);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un potrero con ese nombre en ese campo" };
    throw error;
  }
}
