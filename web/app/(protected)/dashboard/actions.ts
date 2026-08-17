"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { isAdmin } from "@/lib/dal/farm-access";
import { createFarm, type FarmOverviewEntry } from "@/lib/dal/admin-overview";

export type CreateFarmActionResult = { ok: true; entry: FarmOverviewEntry } | { ok: false; error: string };

const nameSchema = z.string().trim().min(1);

// Reachable directly (bypassing the page's own admin-only rendering), so it
// must re-verify admin status independently — same pattern as
// settings/import/actions.ts.
export async function createFarmAction(input: { name: string; managerId: string | null }): Promise<CreateFarmActionResult> {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) return { ok: false, error: "No tenés acceso a esta herramienta" };

  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Datos inválidos" };

  const entry = await createFarm({ name: name.data, managerId: input.managerId });
  return { ok: true, entry };
}
