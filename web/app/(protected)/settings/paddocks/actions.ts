"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess } from "@/lib/dal/farm-access";
import { createPaddock, updatePaddock, getPaddockEstablishmentId, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type PaddockCatalogActionResult = { ok: true; entry: PaddockCatalogEntry } | { ok: false; error: string };

const nameSchema = z.string().trim().min(1);

export async function createPaddockAction(input: {
  establishmentId: string;
  name: string;
}): Promise<PaddockCatalogActionResult> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.establishmentId);
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await createPaddock(input.establishmentId, name.data);
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
  const establishmentId = await getPaddockEstablishmentId(input.id);
  if (!establishmentId) return { ok: false, error: "Potrero no encontrado" };
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
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
