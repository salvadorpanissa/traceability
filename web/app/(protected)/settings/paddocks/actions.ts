"use server";

import { requireSession } from "@/lib/dal/session";
import { createPaddock, updatePaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type PaddockCatalogActionResult = { ok: true; entry: PaddockCatalogEntry } | { ok: false; error: string };

export async function createPaddockAction(input: {
  farmId: string;
  name: string;
}): Promise<PaddockCatalogActionResult> {
  await requireSession();
  try {
    const entry = await createPaddock(input.farmId, input.name);
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
  await requireSession();
  try {
    const entry = await updatePaddock(input.id, input.name);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un potrero con ese nombre en ese campo" };
    throw error;
  }
}
