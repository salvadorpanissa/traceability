import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reproductiveStatus } from "@/db/schema";

export type ReproductiveStatusCatalogEntry = {
  id: string;
  farmId: string;
  name: string;
  active: boolean;
};

const REPRODUCTIVE_STATUS_COLUMNS = {
  id: reproductiveStatus.id,
  farmId: reproductiveStatus.farmId,
  name: reproductiveStatus.name,
  active: reproductiveStatus.active,
};

// Active statuses only — what the Animales edit page and the Sanidad
// value-legend picker should offer for new assignments.
export async function listReproductiveStatusesByFarm(farmId: string): Promise<ReproductiveStatusCatalogEntry[]> {
  return db
    .select(REPRODUCTIVE_STATUS_COLUMNS)
    .from(reproductiveStatus)
    .where(and(eq(reproductiveStatus.farmId, farmId), eq(reproductiveStatus.active, true)))
    .orderBy(asc(reproductiveStatus.name));
}

// Every status (any active state) across a set of farms — the settings page
// lists them all together, archived included.
export async function listAllReproductiveStatusesForFarms(farmIds: string[]): Promise<ReproductiveStatusCatalogEntry[]> {
  if (farmIds.length === 0) return [];
  return db
    .select(REPRODUCTIVE_STATUS_COLUMNS)
    .from(reproductiveStatus)
    .where(inArray(reproductiveStatus.farmId, farmIds))
    .orderBy(asc(reproductiveStatus.name));
}

export async function getReproductiveStatusFarmId(id: string): Promise<string | null> {
  const [row] = await db.select({ farmId: reproductiveStatus.farmId }).from(reproductiveStatus).where(eq(reproductiveStatus.id, id));
  return row?.farmId ?? null;
}

export async function createReproductiveStatus(farmId: string, name: string): Promise<ReproductiveStatusCatalogEntry> {
  const [created] = await db.insert(reproductiveStatus).values({ farmId, name }).returning();
  return created;
}

export async function updateReproductiveStatusName(id: string, name: string): Promise<ReproductiveStatusCatalogEntry> {
  const [updated] = await db.update(reproductiveStatus).set({ name }).where(eq(reproductiveStatus.id, id)).returning();
  return updated;
}

export async function setReproductiveStatusActive(id: string, active: boolean): Promise<void> {
  await db.update(reproductiveStatus).set({ active }).where(eq(reproductiveStatus.id, id));
}
