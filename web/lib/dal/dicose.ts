import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { dicose, establishment, owner } from "@/db/schema";
import { isAdmin, userEstablishmentIds } from "@/lib/dal/farm-access";

export type DicoseEntry = {
  id: string;
  ownerId: string;
  ownerName: string;
  establishmentId: string;
  establishmentName: string;
  dicoseCode: string;
};

export async function listDicoseRegistrations(
  userId: string,
  role: string | undefined
): Promise<DicoseEntry[]> {
  const baseQuery = db
    .select({
      id: dicose.id,
      ownerId: dicose.ownerId,
      ownerName: owner.name,
      establishmentId: dicose.establishmentId,
      establishmentName: establishment.name,
      dicoseCode: dicose.dicoseCode,
    })
    .from(dicose)
    .innerJoin(owner, eq(owner.id, dicose.ownerId))
    .innerJoin(establishment, eq(establishment.id, dicose.establishmentId));

  if (isAdmin(role)) {
    return baseQuery;
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return [];
  return baseQuery.where(inArray(dicose.establishmentId, establishmentIds));
}

export async function createDicoseRegistration(input: {
  ownerId: string;
  establishmentId: string;
  dicoseCode: string;
}): Promise<DicoseEntry> {
  const [created] = await db.insert(dicose).values(input).returning();
  const [ownerRow] = await db.select({ name: owner.name }).from(owner).where(eq(owner.id, created.ownerId));
  const [establishmentRow] = await db
    .select({ name: establishment.name })
    .from(establishment)
    .where(eq(establishment.id, created.establishmentId));
  return {
    id: created.id,
    ownerId: created.ownerId,
    ownerName: ownerRow.name,
    establishmentId: created.establishmentId,
    establishmentName: establishmentRow.name,
    dicoseCode: created.dicoseCode,
  };
}

export async function getDicoseRegistrationEstablishmentId(id: string): Promise<string | null> {
  const [match] = await db.select({ establishmentId: dicose.establishmentId }).from(dicose).where(eq(dicose.id, id));
  return match?.establishmentId ?? null;
}

export async function findEstablishmentByDicoseCode(
  dicoseCode: string,
  userId: string,
  role: string | undefined
): Promise<{ establishmentId: string; establishmentName: string } | null> {
  const baseQuery = db
    .select({ establishmentId: dicose.establishmentId, establishmentName: establishment.name })
    .from(dicose)
    .innerJoin(establishment, eq(establishment.id, dicose.establishmentId));

  if (isAdmin(role)) {
    const [match] = await baseQuery.where(eq(dicose.dicoseCode, dicoseCode));
    return match ?? null;
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return null;
  const [match] = await baseQuery.where(
    and(eq(dicose.dicoseCode, dicoseCode), inArray(dicose.establishmentId, establishmentIds))
  );
  return match ?? null;
}
