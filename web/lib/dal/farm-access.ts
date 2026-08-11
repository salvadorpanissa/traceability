import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { farm, userFarm } from "@/db/schema";

export function isAdmin(role: string | undefined): boolean {
  return role === "admin";
}

// Every grupo the user has at least one direct campo assignment in — the
// only place user_farm is read directly. Assigning a manager to one campo
// in a grupo (e.g. "Juan -> Cuatro Cerros") is provisioning: it puts Juan in
// that grupo. Everything downstream (userFarmIds, listSelectableFarms,
// requireFarmAccess) then expands that to every campo the grupo contains —
// a manager assigned to one campo of a grupo operates all of them, since a
// grupo is one operation split across campos, not independent tenants.
export async function userGroupIds(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ groupId: farm.groupId })
    .from(userFarm)
    .innerJoin(farm, eq(farm.id, userFarm.farmId))
    .where(eq(userFarm.userId, userId));
  return rows.map((row) => row.groupId);
}

export async function userFarmIds(userId: string): Promise<string[]> {
  const groupIds = await userGroupIds(userId);
  if (groupIds.length === 0) return [];
  const rows = await db.select({ id: farm.id }).from(farm).where(inArray(farm.groupId, groupIds));
  return rows.map((row) => row.id);
}

export type SelectableFarm = { id: string; name: string; groupId: string };

// Every campo an admin can operate on; for a manager, every campo in every
// grupo they have at least one assignment in.
export async function listSelectableFarms(userId: string, role: string | undefined): Promise<SelectableFarm[]> {
  if (isAdmin(role)) {
    return db.select({ id: farm.id, name: farm.name, groupId: farm.groupId }).from(farm);
  }

  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];
  return db
    .select({ id: farm.id, name: farm.name, groupId: farm.groupId })
    .from(farm)
    .where(inArray(farm.id, farmIds));
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

export async function getFarmGroupId(farmId: string): Promise<string | null> {
  const [row] = await db.select({ groupId: farm.groupId }).from(farm).where(eq(farm.id, farmId));
  return row?.groupId ?? null;
}

export async function requireGroupAccess(
  userId: string,
  role: string | undefined,
  groupId: string
): Promise<void> {
  if (isAdmin(role)) return;
  const groupIds = await userGroupIds(userId);
  if (!groupIds.includes(groupId)) {
    throw new Error("No tenés acceso a este grupo de campos");
  }
}
