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
  registered: number;
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

// A tag is a legal/DICOSE fact ("this caravana is ours") that can exist with
// or without a real animal behind it yet. If the row carries any biological
// or location data, there's a real animal to create now; a bare tag with
// none of these just registers the caravana.
function hasAnimalSignal(details: OwnTagRowDetails): boolean {
  return !!(details.sex || details.categoryId || details.birthDate || details.paddockName);
}

// Names referenced by a "paddock"-mapped column that don't exist yet for the
// registration's farm — the caller should let the user create them (or fix a
// typo) before confirming, since paddocks are never auto-created silently.
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
  rawRows: MappedOwnTagRow[]
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
    return { registered: 0, located: 0, recategorized: 0, skipped: validCount, invalid };
  }

  const existingOwnTagRows = await db.select({ tag: ownTag.tag }).from(ownTag).where(inArray(ownTag.tag, candidateTags));
  const existingOwnTagSet = new Set(existingOwnTagRows.map((r) => r.tag));
  const brandNewOwnTags = candidateTags.filter((tag) => !existingOwnTagSet.has(tag));

  const historyRows = await db
    .select({ tag: animalTagHistory.tag, animalId: animalTagHistory.animalId })
    .from(animalTagHistory)
    .where(inArray(animalTagHistory.tag, candidateTags));
  const animalIdByTag = new Map(historyRows.map((r) => [r.tag, r.animalId]));

  const [registration] = await db
    .select()
    .from(dicoseRegistration)
    .where(eq(dicoseRegistration.id, dicoseRegistrationId));

  const needsPaddockLookup = candidateTags.some((tag) => rowByTag.get(tag)!.paddockName);
  let paddockIdByName: Map<string, string> | undefined;
  if (needsPaddockLookup) {
    const existingPaddocks = await db.select().from(paddock).where(eq(paddock.farmId, registration.farmId));
    paddockIdByName = new Map(existingPaddocks.map((p) => [p.name.trim().toLowerCase(), p.id]));
  }

  let registered = 0;
  let located = 0;
  let recategorized = 0;
  const productiveTags = new Set<string>();

  await db.transaction(async (tx) => {
    if (brandNewOwnTags.length > 0) {
      await tx.insert(ownTag).values(brandNewOwnTags.map((tag) => ({ tag, dicoseRegistrationId })));
      registered = brandNewOwnTags.length;
      brandNewOwnTags.forEach((tag) => productiveTags.add(tag));
    }

    let needsRefresh = false;

    // Tags with no animal yet: a bare registration stays that way, but any
    // biological or location data means there's a real animal to create now
    // (placed on the registration's farm, in a paddock if one was given).
    const tagsNeedingCreation = candidateTags.filter(
      (tag) => !animalIdByTag.has(tag) && hasAnimalSignal(rowByTag.get(tag)!)
    );

    if (tagsNeedingCreation.length > 0) {
      const [batch] = await tx
        .insert(batchOperation)
        .values({
          eventType: "transfer",
          farmId: registration.farmId,
          animalCount: tagsNeedingCreation.length,
          createdBy: userId,
        })
        .returning();

      for (const tag of tagsNeedingCreation) {
        const details = rowByTag.get(tag)!;
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
            categoryId: details.categoryId,
            sex: details.sex,
            birthDate: details.birthDate,
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
        productiveTags.add(tag);
      }

      needsRefresh = true;
    }

    // A tag can already have a real animal (from an earlier upload, or from
    // a transfer/health load) that's still missing sex, birth date, or a
    // category — fill those gaps on the animal now instead of treating the
    // row as a no-op.
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
        const currentAnimal = animalById.get(animalId)!;

        const plan: (typeof plans)[number] = { tag, animalId };
        if (details.sex && !currentAnimal.sex) plan.sex = details.sex;
        if (details.birthDate && !currentAnimal.birthDate) plan.birthDate = details.birthDate;
        if (details.categoryId && !animalsWithCategory.has(animalId)) plan.categoryId = details.categoryId;

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

        productiveTags.add(plan.tag);
      }
    }

    if (needsRefresh) {
      // See the equivalent comment in transfer.ts/health.ts: one refresh
      // after the whole batch instead of one per row.
      await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
    }
  });

  const skipped = duplicatesWithinFile + (candidateTags.length - productiveTags.size);

  return { registered, located, recategorized, skipped, invalid };
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
