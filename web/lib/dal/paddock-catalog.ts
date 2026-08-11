import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { paddock } from "@/db/schema";

export type PaddockCatalogEntry = {
  id: string;
  name: string;
  establishmentId: string;
};

export async function listPaddocksByEstablishment(establishmentId: string): Promise<PaddockCatalogEntry[]> {
  return db
    .select({ id: paddock.id, name: paddock.name, establishmentId: paddock.establishmentId })
    .from(paddock)
    .where(eq(paddock.establishmentId, establishmentId))
    .orderBy(asc(paddock.name));
}

// Every potrero across a set of establecimientos — used where the
// establecimiento itself is derived from which potrero gets picked, instead
// of asked for separately.
export async function listPaddocksForEstablishments(establishmentIds: string[]): Promise<PaddockCatalogEntry[]> {
  if (establishmentIds.length === 0) return [];
  return db
    .select({ id: paddock.id, name: paddock.name, establishmentId: paddock.establishmentId })
    .from(paddock)
    .where(inArray(paddock.establishmentId, establishmentIds))
    .orderBy(asc(paddock.name));
}

export async function getPaddockEstablishmentId(id: string): Promise<string | null> {
  const [match] = await db.select({ establishmentId: paddock.establishmentId }).from(paddock).where(eq(paddock.id, id));
  return match?.establishmentId ?? null;
}

export async function createPaddock(establishmentId: string, name: string): Promise<PaddockCatalogEntry> {
  const [created] = await db.insert(paddock).values({ establishmentId, name }).returning();
  return { id: created.id, name: created.name, establishmentId: created.establishmentId };
}

export async function updatePaddock(id: string, name: string): Promise<PaddockCatalogEntry> {
  const [updated] = await db.update(paddock).set({ name }).where(eq(paddock.id, id)).returning();
  return { id: updated.id, name: updated.name, establishmentId: updated.establishmentId };
}
