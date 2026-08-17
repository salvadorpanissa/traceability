"use server";

import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess, requireFarmAccess } from "@/lib/dal/farm-access";
import { createDicoseRegistration, type DicoseEntry } from "@/lib/dal/dicose";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

export async function createDicoseRegistrationAction(input: {
  ownerId: string;
  establishmentId: string;
  dicoseCode: string;
}): Promise<DicoseEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.establishmentId);
  return createDicoseRegistration(input);
}

export async function createOwnerAction(farmId: string, name: string): Promise<OwnerCatalogEntry> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, farmId);
  return createOwner(farmId, name);
}
