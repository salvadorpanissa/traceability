import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userFarm } from "@/db/schema";

export function isAdmin(role: string | undefined): boolean {
  return role === "admin";
}

export async function userFarmIds(userId: string): Promise<string[]> {
  const rows = await db.select({ farmId: userFarm.farmId }).from(userFarm).where(eq(userFarm.userId, userId));
  return rows.map((row) => row.farmId);
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
