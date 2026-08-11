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
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

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

  const secondaryTagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.secondaryTag) continue;
    secondaryTagCounts.set(row.secondaryTag, (secondaryTagCounts.get(row.secondaryTag) ?? 0) + 1);
  }

  const nonEmptySecondaryTags = rows.map((r) => r.secondaryTag).filter((v): v is string => !!v);
  const secondaryTagHistoryRows =
    nonEmptySecondaryTags.length > 0
      ? await db
          .select({ secondaryTag: animalTagHistory.secondaryTag, animalId: animalTagHistory.animalId })
          .from(animalTagHistory)
          .where(inArray(animalTagHistory.secondaryTag, nonEmptySecondaryTags))
      : [];
  const animalIdBySecondaryTag = new Map(
    secondaryTagHistoryRows.filter((r): r is { secondaryTag: string; animalId: string } => !!r.secondaryTag).map((r) => [r.secondaryTag, r.animalId])
  );

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

    // A missing or unparseable "Fecha alta en sistema" falls back to today
    // rather than erroring the row — the column is often blank or malformed
    // on real management-system exports, and the exact historical date
    // matters far less here than getting the animal into the system at all.
    const eventDate = (row.eventDate ? normalizeDate(row.eventDate) : null) ?? new Date().toISOString().slice(0, 10);

    if (row.secondaryTag && (secondaryTagCounts.get(row.secondaryTag) ?? 0) > 1) {
      result.push({ status: "error", tag: row.tag, reason: "Chip secundario duplicado en el archivo" });
      continue;
    }
    if (row.secondaryTag) {
      const existingAnimalId = animalIdBySecondaryTag.get(row.secondaryTag);
      if (existingAnimalId) {
        result.push({ status: "error", tag: row.tag, reason: "Chip secundario ya asignado a otro animal" });
        continue;
      }
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
  categoryIdByGroupAndName: Map<string, string>,
  groupId: string,
  name: string | null
): Promise<string | null> {
  if (!name) return null;
  const key = `${groupId}:${name.trim().toLowerCase()}`;
  const existing = categoryIdByGroupAndName.get(key);
  if (existing) return existing;
  const [created] = await tx.insert(category).values({ groupId, name }).returning();
  categoryIdByGroupAndName.set(key, created.id);
  return created.id;
}

async function resolvePaddockId(
  tx: Transaction,
  paddockIdByFarmAndName: Map<string, string>,
  farmId: string,
  name: string | null
): Promise<string | null> {
  if (!name) return null;
  const trimmedName = name.trim();
  const key = `${farmId}:${trimmedName.toLowerCase()}`;
  const existing = paddockIdByFarmAndName.get(key);
  if (existing) return existing;
  const [created] = await tx.insert(paddock).values({ farmId, name: trimmedName }).returning();
  paddockIdByFarmAndName.set(key, created.id);
  return created.id;
}

export async function confirmImportChunk(input: {
  userId: string;
  rows: Extract<ResolvedImportRow, { status: "valid" }>[];
}): Promise<ImportChunkResult> {
  const { userId, rows } = input;
  if (rows.length === 0) return { createdCount: 0 };

  try {
    return await db.transaction(async (tx) => {
      const ownerIdByName = new Map<string, string>();
      const existingOwners = await tx.select({ id: owner.id, name: owner.name }).from(owner);
      for (const o of existingOwners) ownerIdByName.set(o.name.trim().toLowerCase(), o.id);

      const categoryIdByGroupAndName = new Map<string, string>();
      const existingCategories = await tx.select({ id: category.id, name: category.name, groupId: category.groupId }).from(category);
      for (const c of existingCategories) categoryIdByGroupAndName.set(`${c.groupId}:${c.name.trim().toLowerCase()}`, c.id);

      const paddockIdByFarmAndName = new Map<string, string>();
      const existingPaddocks = await tx.select({ id: paddock.id, name: paddock.name, farmId: paddock.farmId }).from(paddock);
      for (const p of existingPaddocks) paddockIdByFarmAndName.set(`${p.farmId}:${p.name.trim().toLowerCase()}`, p.id);

      const groupIdByFarmId = new Map<string, string>();
      const involvedFarms = await tx
        .select({ id: farm.id, groupId: farm.groupId })
        .from(farm)
        .where(inArray(farm.id, [...new Set(rows.map((r) => r.farmId))]));
      for (const f of involvedFarms) groupIdByFarmId.set(f.id, f.groupId);

      const rowsByFarm = new Map<string, typeof rows>();
      for (const row of rows) {
        const group = rowsByFarm.get(row.farmId) ?? [];
        group.push(row);
        rowsByFarm.set(row.farmId, group);
      }

      let createdCount = 0;
      for (const [farmId, farmRows] of rowsByFarm) {
        const groupId = groupIdByFarmId.get(farmId);
        if (!groupId) throw new Error("Campo no encontrado");
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
          const categoryId = await resolveCategoryId(tx, categoryIdByGroupAndName, groupId, row.categoryName);
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
  } catch (error) {
    if (isUniqueViolationError(error)) {
      throw new Error("Chip secundario o caravana duplicados");
    }
    throw error;
  }
}
