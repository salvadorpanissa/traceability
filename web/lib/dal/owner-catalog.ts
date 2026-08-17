import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { owner } from "@/db/schema";

export type OwnerCatalogEntry = {
  id: string;
  name: string;
  farmId: string;
};

export async function listOwnersByFarms(farmIds: string[]): Promise<OwnerCatalogEntry[]> {
  if (farmIds.length === 0) return [];
  return db
    .select({ id: owner.id, name: owner.name, farmId: owner.farmId })
    .from(owner)
    .where(inArray(owner.farmId, farmIds))
    .orderBy(asc(owner.name));
}

export async function createOwner(farmId: string, name: string): Promise<OwnerCatalogEntry> {
  const [created] = await db.insert(owner).values({ farmId, name }).returning();
  return { id: created.id, name: created.name, farmId: created.farmId };
}
