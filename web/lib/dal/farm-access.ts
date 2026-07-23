import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { farm, userFarm } from "@/db/schema";

export function isAdmin(role: string | undefined): boolean {
  return role === "admin";
}

export async function userFarmIds(userId: string): Promise<string[]> {
  const rows = await db.select({ farmId: userFarm.farmId }).from(userFarm).where(eq(userFarm.userId, userId));
  return rows.map((row) => row.farmId);
}

export type SelectableFarm = { id: string; name: string };

// Every campo an admin can operate on; for a manager, only the campos they're
// assigned to via user_farm — the 1-user-N-campos model each activity (and
// the DICOSE registration list) scopes itself against.
export async function listSelectableFarms(userId: string, role: string | undefined): Promise<SelectableFarm[]> {
  if (isAdmin(role)) {
    return db.select({ id: farm.id, name: farm.name }).from(farm);
  }

  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];
  return db.select({ id: farm.id, name: farm.name }).from(farm).where(inArray(farm.id, farmIds));
}

export async function requireFarmAccess(
  userId: string,
  role: string | undefined,
  farmId: string
): Promise<void> {
  if (isAdmin(role)) return;
  const farmIds = await userFarmIds(userId);
  if (!farmIds.includes(farmId)) {
    throw new Error("No tenés acceso a este campo");
  }
}
