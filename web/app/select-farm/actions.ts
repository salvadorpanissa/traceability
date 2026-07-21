"use server";

import { inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farm } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

export async function getSelectableFarms() {
  const session = await requireSession();
  const role = session.user.role;
  const userId = session.user.id;

  if (isAdmin(role)) {
    return db.select({ id: farm.id, name: farm.name }).from(farm);
  }

  const allowedFarmIds = await userFarmIds(userId);
  if (allowedFarmIds.length === 0) return [];
  return db.select({ id: farm.id, name: farm.name }).from(farm).where(inArray(farm.id, allowedFarmIds));
}

export async function selectFarmAction(farmId: string) {
  const session = await requireSession();
  const role = session.user.role;
  const userId = session.user.id;

  if (!isAdmin(role)) {
    const allowedFarmIds = await userFarmIds(userId);
    if (!allowedFarmIds.includes(farmId)) {
      throw new Error("No tenés acceso a este campo");
    }
  }

  const cookieStore = await cookies();
  cookieStore.set("active_farm_id", farmId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}
