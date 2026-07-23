import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { paddock } from "@/db/schema";

export type PaddockCatalogEntry = {
  id: string;
  name: string;
  farmId: string;
};

export async function listPaddocksByFarm(farmId: string): Promise<PaddockCatalogEntry[]> {
  return db
    .select({ id: paddock.id, name: paddock.name, farmId: paddock.farmId })
    .from(paddock)
    .where(eq(paddock.farmId, farmId))
    .orderBy(asc(paddock.name));
}

// Every potrero across a set of campos — used where the farm itself is
// derived from which potrero gets picked, instead of asked for separately.
export async function listPaddocksForFarms(farmIds: string[]): Promise<PaddockCatalogEntry[]> {
  if (farmIds.length === 0) return [];
  return db
    .select({ id: paddock.id, name: paddock.name, farmId: paddock.farmId })
    .from(paddock)
    .where(inArray(paddock.farmId, farmIds))
    .orderBy(asc(paddock.name));
}

export async function createPaddock(farmId: string, name: string): Promise<PaddockCatalogEntry> {
  const [created] = await db.insert(paddock).values({ farmId, name }).returning();
  return { id: created.id, name: created.name, farmId: created.farmId };
}

export async function updatePaddock(id: string, name: string): Promise<PaddockCatalogEntry> {
  const [updated] = await db.update(paddock).set({ name }).where(eq(paddock.id, id)).returning();
  return { id: updated.id, name: updated.name, farmId: updated.farmId };
}
