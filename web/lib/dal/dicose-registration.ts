import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { dicoseRegistration, farm, owner } from "@/db/schema";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

export type DicoseRegistrationEntry = {
  id: string;
  ownerId: string;
  ownerName: string;
  farmId: string;
  farmName: string;
  dicoseCode: string;
};

export async function listDicoseRegistrations(
  userId: string,
  role: string | undefined
): Promise<DicoseRegistrationEntry[]> {
  const baseQuery = db
    .select({
      id: dicoseRegistration.id,
      ownerId: dicoseRegistration.ownerId,
      ownerName: owner.name,
      farmId: dicoseRegistration.farmId,
      farmName: farm.name,
      dicoseCode: dicoseRegistration.dicoseCode,
    })
    .from(dicoseRegistration)
    .innerJoin(owner, eq(owner.id, dicoseRegistration.ownerId))
    .innerJoin(farm, eq(farm.id, dicoseRegistration.farmId));

  if (isAdmin(role)) {
    return baseQuery;
  }

  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];
  return baseQuery.where(inArray(dicoseRegistration.farmId, farmIds));
}

export async function createDicoseRegistration(input: {
  ownerId: string;
  farmId: string;
  dicoseCode: string;
}): Promise<DicoseRegistrationEntry> {
  const [created] = await db.insert(dicoseRegistration).values(input).returning();
  const [ownerRow] = await db.select({ name: owner.name }).from(owner).where(eq(owner.id, created.ownerId));
  const [farmRow] = await db.select({ name: farm.name }).from(farm).where(eq(farm.id, created.farmId));
  return {
    id: created.id,
    ownerId: created.ownerId,
    ownerName: ownerRow.name,
    farmId: created.farmId,
    farmName: farmRow.name,
    dicoseCode: created.dicoseCode,
  };
}
