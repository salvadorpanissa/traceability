"use server";

import { asc } from "drizzle-orm";
import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess } from "@/lib/dal/farm-access";
import { db } from "@/db";
import { establishment } from "@/db/schema";
import { createDicoseRegistration, type DicoseEntry } from "@/lib/dal/dicose";

export async function listEstablishments(): Promise<{ id: string; name: string }[]> {
  await requireSession();
  return db.select({ id: establishment.id, name: establishment.name }).from(establishment).orderBy(asc(establishment.name));
}

export async function createDicoseRegistrationAction(input: {
  ownerId: string;
  establishmentId: string;
  dicoseCode: string;
}): Promise<DicoseEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.establishmentId);
  return createDicoseRegistration(input);
}
