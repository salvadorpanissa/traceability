"use server";

import { asc } from "drizzle-orm";
import { requireSession } from "@/lib/dal/session";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { db } from "@/db";
import { farm } from "@/db/schema";
import { createDicoseRegistration, type DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";

export async function listFarms(): Promise<{ id: string; name: string }[]> {
  await requireSession();
  return db.select({ id: farm.id, name: farm.name }).from(farm).orderBy(asc(farm.name));
}

export async function createDicoseRegistrationAction(input: {
  ownerId: string;
  farmId: string;
  dicoseCode: string;
}): Promise<DicoseRegistrationEntry> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, input.farmId);
  return createDicoseRegistration(input);
}
