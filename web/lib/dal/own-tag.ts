import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ownTag,
  category,
  dicoseRegistration,
  paddock,
  batchOperation,
  event,
  eventTransfer,
  eventRecategorize,
  animal,
  animalTagHistory,
} from "@/db/schema";
import { normalizeSex } from "@/lib/activities/sex-normalization";
import { normalizeDate } from "@/lib/activities/date-normalization";
import { createNewAnimal } from "@/lib/activities/animal-creation";
import type { MappedOwnTagRow } from "@/lib/activities/column-mapping";

export type OwnTagImportResult = {
  inserted: number;
  updated: number;
  located: number;
  recategorized: number;
  skipped: number;
  invalid: number;
};

const CARAVAN_PATTERN = /^\d+$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type OwnTagRowDetails = {
  sex: "male" | "female" | null;
  categoryId: string | null;
  birthDate: string | null;
  paddockName: string | null;
  eventDate: string | null;
};

// Names referenced by a "paddock"-mapped column that don't exist yet for the
// registration's farm — the caller should let the user create them (or fix a
// typo) before calling importOwnTags with locate: true, since paddocks are
// never auto-created silently.
export async function findMissingPaddockNames(dicoseRegistrationId: string, paddockNames: string[]): Promise<string[]> {
  const distinctNames = [...new Set(paddockNames.map((n) => n.trim()).filter(Boolean))];
  if (distinctNames.length === 0) return [];

  const [registration] = await db
    .select()
    .from(dicoseRegistration)
    .where(eq(dicoseRegistration.id, dicoseRegistrationId));
  const existingPaddocks = await db.select({ name: paddock.name }).from(paddock).where(eq(paddock.farmId, registration.farmId));
  const existingNames = new Set(existingPaddocks.map((p) => p.name.trim().toLowerCase()));

  return distinctNames.filter((name) => !existingNames.has(name.toLowerCase()));
}

// Same idea as findMissingPaddockNames, but for the "category" column —
// categories are a global list with no other creation flow in the app, so an
// unrecognized name silently resolved to null instead of ever landing on the
// tag. Exact match, matching how category names are matched everywhere else.
export async function findMissingCategoryNames(categoryNames: string[]): Promise<string[]> {
  const distinctNames = [...new Set(categoryNames.map((n) => n.trim()).filter(Boolean))];
  if (distinctNames.length === 0) return [];

  const existingCategories = await db.select({ name: category.name }).from(category);
  const existingNames = new Set(existingCategories.map((c) => c.name));

  return distinctNames.filter((name) => !existingNames.has(name));
}

export async function importOwnTags(
  dicoseRegistrationId: string,
  userId: string,
  rawRows: MappedOwnTagRow[],
  options: { locate: boolean } = { locate: false }
): Promise<OwnTagImportResult> {
  const categoryRows = await db.select({ id: category.id, name: category.name }).from(category);
  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

  let invalid = 0;
  let validCount = 0;
  const rowByTag = new Map<string, OwnTagRowDetails>();

  for (const row of rawRows) {
    const tag = row.tag.trim();
    if (!tag) continue;
    if (!CARAVAN_PATTERN.test(tag)) {
      invalid++;
      continue;
    }
    validCount++;
    rowByTag.set(tag, {
      sex: normalizeSex(row.sex),
      categoryId: row.category ? (categoryIdByName.get(row.category) ?? null) : null,
      birthDate: row.birthDate ? normalizeDate(row.birthDate) : null,
      paddockName: row.paddock?.trim() || null,
      eventDate: row.date ? normalizeDate(row.date) : null,
    });
  }

  const candidateTags = [...rowByTag.keys()];
  const duplicatesWithinFile = validCount - candidateTags.length;
  if (candidateTags.length === 0) {
    return { inserted: 0, updated: 0, located: 0, recategorized: 0, skipped: validCount, invalid };
  }

  const existingRows = await db.select().from(ownTag).where(inArray(ownTag.tag, candidateTags));
  const existingByTag = new Map(existingRows.map((r) => [r.tag, r]));
  const brandNewTags = candidateTags.filter((tag) => !existingByTag.has(tag));
  const alreadyRegisteredTags = candidateTags.filter((tag) => existingByTag.has(tag));

  const historyRows = await db
    .select({ tag: animalTagHistory.tag, animalId: animalTagHistory.animalId })
    .from(animalTagHistory)
    .where(inArray(animalTagHistory.tag, candidateTags));
  const animalIdByTag = new Map(historyRows.map((r) => [r.tag, r.animalId]));

  // Registration/farm is needed both for placing brand-new animals (locate)
  // and for enriching already-existing ones with data this upload adds that
  // they didn't have yet (sex, birth date, category) — so it's fetched
  // unconditionally, not just when options.locate is set.
  const [registration] = await db
    .select()
    .from(dicoseRegistration)
    .where(eq(dicoseRegistration.id, dicoseRegistrationId));

  let paddockIdByName: Map<string, string> | undefined;
  if (options.locate) {
    const existingPaddocks = await db.select().from(paddock).where(eq(paddock.farmId, registration.farmId));
    paddockIdByName = new Map(existingPaddocks.map((p) => [p.name.trim().toLowerCase(), p.id]));
  }

  let inserted = 0;
  let updated = 0;
  let located = 0;
  let recategorized = 0;
  let skipped = duplicatesWithinFile;

  await db.transaction(async (tx) => {
    if (brandNewTags.length > 0) {
      await tx.insert(ownTag).values(
        brandNewTags.map((tag) => {
          const details = rowByTag.get(tag)!;
          return {
            tag,
            dicoseRegistrationId,
            createdBy: userId,
            sex: details.sex,
            categoryId: details.categoryId,
            birthDate: details.birthDate,
          };
        })
      );
      inserted = brandNewTags.length;
    }

    // A tag already registered can still be missing fields it didn't carry
    // the first time around (e.g. category wasn't mapped yet) — fill those
    // gaps now instead of silently treating the row as a no-op.
    for (const tag of alreadyRegisteredTags) {
      const details = rowByTag.get(tag)!;
      const existing = existingByTag.get(tag)!;
      const patch: Partial<{ sex: "male" | "female"; categoryId: string; birthDate: string }> = {};
      if (details.sex && !existing.sex) patch.sex = details.sex;
      if (details.categoryId && !existing.categoryId) patch.categoryId = details.categoryId;
      if (details.birthDate && !existing.birthDate) patch.birthDate = details.birthDate;

      if (Object.keys(patch).length > 0) {
        await tx.update(ownTag).set(patch).where(eq(ownTag.tag, tag));
        updated++;
      } else {
        skipped++;
      }
    }

    let needsRefresh = false;

    if (options.locate) {
      const tagsNeedingPlacement = candidateTags.filter((tag) => !animalIdByTag.has(tag));

      if (tagsNeedingPlacement.length > 0) {
        const [batch] = await tx
          .insert(batchOperation)
          .values({
            eventType: "transfer",
            farmId: registration.farmId,
            animalCount: tagsNeedingPlacement.length,
            createdBy: userId,
          })
          .returning();

        for (const tag of tagsNeedingPlacement) {
          const details = rowByTag.get(tag)!;
          const existing = existingByTag.get(tag);
          const sex = existing?.sex ?? details.sex ?? null;
          const categoryId = existing?.categoryId ?? details.categoryId ?? null;
          const birthDate = existing?.birthDate ?? details.birthDate ?? null;
          const eventDate = details.eventDate ?? today();

          const destinationPaddockId = details.paddockName
            ? (paddockIdByName!.get(details.paddockName.toLowerCase()) ?? null)
            : null;

          const animalId = await createNewAnimal(tx, {
            userId,
            operatingFarmId: registration.farmId,
            batchId: batch.id,
            row: {
              tag,
              eventDate,
              notes: null,
              status: "new",
              categoryId,
              sex,
              birthDate,
              ownerId: registration.ownerId,
              pendingOwnerName: null,
            },
          });

          const [placementEvent] = await tx
            .insert(event)
            .values({
              eventType: "transfer",
              eventDate,
              animalId,
              farmId: registration.farmId,
              batchOperationId: batch.id,
              createdBy: userId,
            })
            .returning();
          await tx.insert(eventTransfer).values({
            eventId: placementEvent.id,
            originFarmId: registration.farmId,
            destinationFarmId: registration.farmId,
            originPaddockId: null,
            destinationPaddockId,
          });
          located++;
        }

        needsRefresh = true;
      }
    }

    // A tag can already have a real animal from an earlier upload (or from a
    // transfer/health load) that never got a category, sex, or birth date —
    // e.g. this same upload flow before the category column was mapped. Fill
    // those gaps on the actual animal now instead of only updating the
    // own_tag registry copy, which never reaches animal_current_state.
    const tagsWithAnimal = candidateTags.filter((tag) => animalIdByTag.has(tag));
    if (tagsWithAnimal.length > 0) {
      const animalIds = tagsWithAnimal.map((tag) => animalIdByTag.get(tag)!);
      const animalRows = await tx.select().from(animal).where(inArray(animal.id, animalIds));
      const animalById = new Map(animalRows.map((a) => [a.id, a]));

      const categorizedRows = await tx
        .select({ animalId: event.animalId })
        .from(event)
        .innerJoin(eventRecategorize, eq(eventRecategorize.eventId, event.id))
        .where(inArray(event.animalId, animalIds));
      const animalsWithCategory = new Set(categorizedRows.map((r) => r.animalId));

      const plans: { tag: string; animalId: string; sex?: "male" | "female"; birthDate?: string; categoryId?: string }[] = [];
      for (const tag of tagsWithAnimal) {
        const animalId = animalIdByTag.get(tag)!;
        const details = rowByTag.get(tag)!;
        const existing = existingByTag.get(tag);
        const currentAnimal = animalById.get(animalId)!;

        const mergedSex = details.sex ?? existing?.sex ?? null;
        const mergedBirthDate = details.birthDate ?? existing?.birthDate ?? null;
        const mergedCategoryId = details.categoryId ?? existing?.categoryId ?? null;

        const plan: (typeof plans)[number] = { tag, animalId };
        if (mergedSex && !currentAnimal.sex) plan.sex = mergedSex;
        if (mergedBirthDate && !currentAnimal.birthDate) plan.birthDate = mergedBirthDate;
        if (mergedCategoryId && !animalsWithCategory.has(animalId)) plan.categoryId = mergedCategoryId;

        if (plan.sex || plan.birthDate || plan.categoryId) plans.push(plan);
      }

      const plansNeedingCategory = plans.filter((p) => p.categoryId);
      let recategorizeBatchId: string | null = null;
      if (plansNeedingCategory.length > 0) {
        const [batch] = await tx
          .insert(batchOperation)
          .values({
            eventType: "recategorize",
            farmId: registration.farmId,
            animalCount: plansNeedingCategory.length,
            createdBy: userId,
          })
          .returning();
        recategorizeBatchId = batch.id;
      }

      for (const plan of plans) {
        const animalPatch: Partial<{ sex: "male" | "female"; birthDate: string }> = {};
        if (plan.sex) animalPatch.sex = plan.sex;
        if (plan.birthDate) animalPatch.birthDate = plan.birthDate;
        if (Object.keys(animalPatch).length > 0) {
          await tx.update(animal).set(animalPatch).where(eq(animal.id, plan.animalId));
          needsRefresh = true;
        }

        if (plan.categoryId && recategorizeBatchId) {
          const details = rowByTag.get(plan.tag)!;
          const eventDate = details.eventDate ?? today();
          const [recategorizeEvent] = await tx
            .insert(event)
            .values({
              eventType: "recategorize",
              eventDate,
              animalId: plan.animalId,
              farmId: registration.farmId,
              batchOperationId: recategorizeBatchId,
              createdBy: userId,
            })
            .returning();
          await tx
            .insert(eventRecategorize)
            .values({ eventId: recategorizeEvent.id, oldCategoryId: plan.categoryId, newCategoryId: plan.categoryId });
          recategorized++;
          needsRefresh = true;
        }
      }
    }

    if (needsRefresh) {
      // See the equivalent comment in transfer.ts/health.ts: one refresh
      // after the whole batch instead of one per row.
      await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
    }
  });

  return { inserted, updated, located, recategorized, skipped, invalid };
}

export async function countOwnTagsByRegistration(): Promise<
  { dicoseRegistrationId: string; count: number; lastUploadedAt: Date | null }[]
> {
  const rows = await db
    .select({
      dicoseRegistrationId: ownTag.dicoseRegistrationId,
      count: sql<number>`count(*)::int`,
      lastUploadedAt: sql<string | null>`max(${ownTag.createdAt})`,
    })
    .from(ownTag)
    .groupBy(ownTag.dicoseRegistrationId);

  return rows.map((row) => ({
    ...row,
    lastUploadedAt: row.lastUploadedAt ? new Date(row.lastUploadedAt) : null,
  }));
}
