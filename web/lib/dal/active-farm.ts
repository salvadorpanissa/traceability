import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farm } from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";

export type ActiveFarm = { id: string; name: string };

/**
 * Resolves the farm a session is allowed to treat as "active".
 *
 * The `active_farm_id` cookie is client-writable (httpOnly only blocks JS
 * reads, not arbitrary writes via devtools/crafted requests), so it cannot be
 * trusted on its own. This confirms the farm exists AND that the session
 * user currently has access to it via the DAL, returning null if either
 * check fails so callers can bounce back to farm selection.
 */
export async function resolveActiveFarm(
  userId: string,
  role: string | undefined,
  farmId: string
): Promise<ActiveFarm | null> {
  const [activeFarm] = await db.select({ id: farm.id, name: farm.name }).from(farm).where(eq(farm.id, farmId));

  if (!activeFarm) {
    return null;
  }

  try {
    await requireFarmAccess(userId, role, farmId);
  } catch {
    return null;
  }

  return activeFarm;
}
