"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import {
  createReproductiveStatus,
  updateReproductiveStatusName,
  getReproductiveStatusFarmId,
  setReproductiveStatusActive,
  listAllReproductiveStatusesForFarms,
  type ReproductiveStatusCatalogEntry,
} from "@/lib/dal/reproductive-status-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type ReproductiveStatusActionResult =
  | { ok: true; entry: ReproductiveStatusCatalogEntry }
  | { ok: false; error: string };

const nameSchema = z.string().trim().min(1);

export async function createReproductiveStatusAction(input: {
  farmId: string;
  name: string;
}): Promise<ReproductiveStatusActionResult> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, input.farmId);

  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await createReproductiveStatus(input.farmId, name.data);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un estado reproductivo con ese nombre" };
    throw error;
  }
}

export async function updateReproductiveStatusAction(input: {
  id: string;
  name: string;
}): Promise<ReproductiveStatusActionResult> {
  const session = await requireSession();
  const farmId = await getReproductiveStatusFarmId(input.id);
  if (!farmId) return { ok: false, error: "Estado reproductivo no encontrado" };
  await requireFarmAccess(session.user.id, session.user.role, farmId);

  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Datos inválidos" };
  try {
    const entry = await updateReproductiveStatusName(input.id, name.data);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un estado reproductivo con ese nombre" };
    throw error;
  }
}

export async function archiveReproductiveStatusAction(id: string): Promise<ReproductiveStatusActionResult> {
  const session = await requireSession();
  const farmId = await getReproductiveStatusFarmId(id);
  if (!farmId) return { ok: false, error: "Estado reproductivo no encontrado" };
  await requireFarmAccess(session.user.id, session.user.role, farmId);

  await setReproductiveStatusActive(id, false);
  const entries = await listAllReproductiveStatusesForFarms([farmId]);
  const entry = entries.find((e) => e.id === id)!;
  return { ok: true, entry };
}
