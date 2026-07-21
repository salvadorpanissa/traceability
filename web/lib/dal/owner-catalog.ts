import { asc } from "drizzle-orm";
import { db } from "@/db";
import { owner } from "@/db/schema";

export type OwnerCatalogEntry = {
  id: string;
  name: string;
};

export async function listOwners(): Promise<OwnerCatalogEntry[]> {
  return db.select({ id: owner.id, name: owner.name }).from(owner).orderBy(asc(owner.name));
}

export async function createOwner(name: string): Promise<OwnerCatalogEntry> {
  const [created] = await db.insert(owner).values({ name }).returning();
  return { id: created.id, name: created.name };
}
