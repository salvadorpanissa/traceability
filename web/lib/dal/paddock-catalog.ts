import { asc, eq } from "drizzle-orm";
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

export async function createPaddock(farmId: string, name: string): Promise<PaddockCatalogEntry> {
  const [created] = await db.insert(paddock).values({ farmId, name }).returning();
  return { id: created.id, name: created.name, farmId: created.farmId };
}
