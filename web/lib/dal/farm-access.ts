import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { establishment, farm, userFarm } from "@/db/schema";

export function isAdmin(role: string | undefined): boolean {
  return role === "admin";
}

// A user is assigned directly to a farm (the top-level operation), never to
// an individual establecimiento — a manager assigned to a farm operates
// every establecimiento it contains, since a farm is one operation split
// across establecimientos, not independent tenants.
export async function userFarmIds(userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ farmId: userFarm.farmId }).from(userFarm).where(eq(userFarm.userId, userId));
  return rows.map((row) => row.farmId);
}

export async function userEstablishmentIds(userId: string): Promise<string[]> {
  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];
  const rows = await db.select({ id: establishment.id }).from(establishment).where(inArray(establishment.farmId, farmIds));
  return rows.map((row) => row.id);
}

// Every farm (operación) an admin can operate on; for a manager, every farm
// they're directly assigned to.
export async function listSelectableFarms(userId: string, role: string | undefined): Promise<{ id: string; name: string }[]> {
  if (isAdmin(role)) {
    return db.select({ id: farm.id, name: farm.name }).from(farm);
  }

  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];
  return db.select({ id: farm.id, name: farm.name }).from(farm).where(inArray(farm.id, farmIds));
}

export type SelectableEstablishment = { id: string; name: string; farmId: string };

// Every establecimiento an admin can operate on; for a manager, every
// establecimiento in every farm they're assigned to.
export async function listSelectableEstablishments(
  userId: string,
  role: string | undefined
): Promise<SelectableEstablishment[]> {
  if (isAdmin(role)) {
    return db.select({ id: establishment.id, name: establishment.name, farmId: establishment.farmId }).from(establishment);
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return [];
  return db
    .select({ id: establishment.id, name: establishment.name, farmId: establishment.farmId })
    .from(establishment)
    .where(inArray(establishment.id, establishmentIds));
}

export async function requireEstablishmentAccess(
  userId: string,
  role: string | undefined,
  establishmentId: string
): Promise<void> {
  if (isAdmin(role)) return;
  const establishmentIds = await userEstablishmentIds(userId);
  if (!establishmentIds.includes(establishmentId)) {
    throw new Error("No tenés acceso a este campo");
  }
}

export async function getEstablishmentFarmId(establishmentId: string): Promise<string | null> {
  const [row] = await db.select({ farmId: establishment.farmId }).from(establishment).where(eq(establishment.id, establishmentId));
  return row?.farmId ?? null;
}

export async function requireFarmAccess(userId: string, role: string | undefined, farmId: string): Promise<void> {
  if (isAdmin(role)) return;
  const farmIds = await userFarmIds(userId);
  if (!farmIds.includes(farmId)) {
    throw new Error("No tenés acceso a este grupo de campos");
  }
}
