import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  animal,
  animalTagHistory,
  batchOperation,
  category,
  event,
  eventRecategorize,
  eventRetag,
  eventTransfer,
  farm,
  owner,
  paddock,
} from "@/db/schema";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";
import { normalizeSex } from "@/lib/activities/sex-normalization";
import { normalizeDate } from "@/lib/activities/date-normalization";

export type ResolvedImportRow =
  | {
      status: "valid";
      tag: string;
      secondaryTag: string | null;
      ownerName: string | null;
      farmId: string;
      paddockName: string | null;
      categoryName: string | null;
      breed: string | null;
      sex: "male" | "female" | null;
      birthDate: string | null;
      eventDate: string;
    }
  | { status: "error"; tag: string; reason: string };

export async function resolveImportRows(rows: MappedImportRow[]): Promise<ResolvedImportRow[]> {
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
  }

  const nonEmptyTags = rows.map((r) => r.tag).filter((tag) => tag.length > 0);
  const existingTagRows =
    nonEmptyTags.length > 0
      ? await db.select({ tag: animalTagHistory.tag }).from(animalTagHistory).where(inArray(animalTagHistory.tag, nonEmptyTags))
      : [];
  const existingTags = new Set(existingTagRows.map((r) => r.tag));

  const farmRows = await db.select({ id: farm.id, name: farm.name }).from(farm);
  const farmIdByName = new Map(farmRows.map((f) => [f.name.trim(), f.id]));

  const result: ResolvedImportRow[] = [];
  for (const row of rows) {
    if (!row.tag) {
      result.push({ status: "error", tag: row.tag, reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ status: "error", tag: row.tag, reason: "Caravana duplicada en el archivo" });
      continue;
    }
    if (existingTags.has(row.tag)) {
      result.push({ status: "error", tag: row.tag, reason: "La caravana ya existe en el sistema" });
      continue;
    }

    const farmName = row.farmName?.trim();
    const farmId = farmName ? farmIdByName.get(farmName) : undefined;
    if (!farmId) {
      result.push({ status: "error", tag: row.tag, reason: "Estancia no reconocida" });
      continue;
    }

    const eventDate = row.eventDate ? normalizeDate(row.eventDate) : null;
    if (!eventDate) {
      result.push({ status: "error", tag: row.tag, reason: "Falta fecha de alta" });
      continue;
    }

    result.push({
      status: "valid",
      tag: row.tag,
      secondaryTag: row.secondaryTag,
      ownerName: row.ownerName,
      farmId,
      paddockName: row.paddockName,
      categoryName: row.categoryName,
      breed: row.breed,
      sex: normalizeSex(row.sex),
      birthDate: row.birthDate ? normalizeDate(row.birthDate) : null,
      eventDate,
    });
  }

  return result;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ImportChunkResult = { createdCount: number };

async function resolveOwnerId(
  tx: Transaction,
  ownerIdByName: Map<string, string>,
  name: string | null
): Promise<string | null> {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const existing = ownerIdByName.get(key);
  if (existing) return existing;
  const [created] = await tx.insert(owner).values({ name: name.trim() }).returning();
  ownerIdByName.set(key, created.id);
  return created.id;
}

async function resolveCategoryId(
  tx: Transaction,
  categoryIdByName: Map<string, string>,
  name: string | null
): Promise<string | null> {
  if (!name) return null;
  const existing = categoryIdByName.get(name);
  if (existing) return existing;
  const [created] = await tx.insert(category).values({ name }).returning();
  categoryIdByName.set(name, created.id);
  return created.id;
}

async function resolvePaddockId(
  tx: Transaction,
  paddockIdByFarmAndName: Map<string, string>,
  farmId: string,
  name: string | null
): Promise<string | null> {
  if (!name) return null;
  const key = `${farmId}:${name}`;
  const existing = paddockIdByFarmAndName.get(key);
  if (existing) return existing;
  const [created] = await tx.insert(paddock).values({ farmId, name }).returning();
  paddockIdByFarmAndName.set(key, created.id);
  return created.id;
}

export async function confirmImportChunk(input: {
  userId: string;
  rows: Extract<ResolvedImportRow, { status: "valid" }>[];
}): Promise<ImportChunkResult> {
  const { userId, rows } = input;
  if (rows.length === 0) return { createdCount: 0 };

  return db.transaction(async (tx) => {
    const ownerIdByName = new Map<string, string>();
    const existingOwners = await tx.select({ id: owner.id, name: owner.name }).from(owner);
    for (const o of existingOwners) ownerIdByName.set(o.name.trim().toLowerCase(), o.id);

    const categoryIdByName = new Map<string, string>();
    const existingCategories = await tx.select({ id: category.id, name: category.name }).from(category);
    for (const c of existingCategories) categoryIdByName.set(c.name, c.id);

    const paddockIdByFarmAndName = new Map<string, string>();
    const existingPaddocks = await tx.select({ id: paddock.id, name: paddock.name, farmId: paddock.farmId }).from(paddock);
    for (const p of existingPaddocks) paddockIdByFarmAndName.set(`${p.farmId}:${p.name}`, p.id);

    const rowsByFarm = new Map<string, typeof rows>();
    for (const row of rows) {
      const group = rowsByFarm.get(row.farmId) ?? [];
      group.push(row);
      rowsByFarm.set(row.farmId, group);
    }

    let createdCount = 0;
    for (const [farmId, farmRows] of rowsByFarm) {
      const [batch] = await tx
        .insert(batchOperation)
        .values({
          eventType: "transfer",
          farmId,
          animalCount: farmRows.length,
          createdBy: userId,
        })
        .returning();

      for (const row of farmRows) {
        const ownerId = await resolveOwnerId(tx, ownerIdByName, row.ownerName);
        const categoryId = await resolveCategoryId(tx, categoryIdByName, row.categoryName);
        const paddockId = await resolvePaddockId(tx, paddockIdByFarmAndName, farmId, row.paddockName);

        const [createdAnimal] = await tx
          .insert(animal)
          .values({ sex: row.sex, ownerId, birthDate: row.birthDate, breed: row.breed })
          .returning();
        await tx
          .insert(animalTagHistory)
          .values({ animalId: createdAnimal.id, tag: row.tag, secondaryTag: row.secondaryTag });

        const [retagEvent] = await tx
          .insert(event)
          .values({
            eventType: "retag",
            eventDate: row.eventDate,
            animalId: createdAnimal.id,
            farmId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: row.tag, newTag: row.tag });

        if (categoryId) {
          const [recategorizeEvent] = await tx
            .insert(event)
            .values({
              eventType: "recategorize",
              eventDate: row.eventDate,
              animalId: createdAnimal.id,
              farmId,
              batchOperationId: batch.id,
              createdBy: userId,
            })
            .returning();
          await tx
            .insert(eventRecategorize)
            .values({ eventId: recategorizeEvent.id, oldCategoryId: categoryId, newCategoryId: categoryId, source: "initial" });
        }

        const [transferEvent] = await tx
          .insert(event)
          .values({
            eventType: "transfer",
            eventDate: row.eventDate,
            animalId: createdAnimal.id,
            farmId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventTransfer).values({
          eventId: transferEvent.id,
          originFarmId: farmId,
          destinationFarmId: farmId,
          destinationPaddockId: paddockId,
        });

        createdCount += 1;
      }
    }

    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
    return { createdCount };
  });
}
