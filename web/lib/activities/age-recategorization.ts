import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, batchOperation, event, eventRecategorize } from "@/db/schema";
import { getOrCreateSystemUser } from "@/lib/dal/system-user";
import { logError } from "@/lib/logger";

// Whole elapsed calendar months between two ISO dates (yyyy-mm-dd),
// matching everyday "age in months" semantics: the day-of-month must have
// been reached for the current month to count. Clamped at 0 so a
// data-entry birth date in the future never produces a negative age.
export function computeAgeMonths(birthDateIso: string, asOfIso: string): number {
  const [birthYear, birthMonth, birthDay] = birthDateIso.split("-").map(Number);
  const [asOfYear, asOfMonth, asOfDay] = asOfIso.split("-").map(Number);
  let months = (asOfYear - birthYear) * 12 + (asOfMonth - birthMonth);
  if (asOfDay < birthDay) months -= 1;
  return Math.max(0, months);
}

export type AgeCategoryRule = { id: string; sex: "male" | "female" | null; minAgeMonths: number | null };

// Among categories eligible for this animal's sex (sex-matched or
// sex-unscoped) and age (minAgeMonths at or below its current age), picks
// the one with the highest minAgeMonths — the bracket the animal's age
// currently falls into. Categories with minAgeMonths: null never
// participate; they're manual-only by definition. Returns null if the
// animal is younger than every configured bracket for its sex.
export function resolveCategoryForAge(
  categories: AgeCategoryRule[],
  animalSex: "male" | "female",
  ageMonths: number
): string | null {
  const eligible = categories.filter(
    (c) => c.minAgeMonths !== null && c.minAgeMonths <= ageMonths && (c.sex === null || c.sex === animalSex)
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, c) => (c.minAgeMonths! > best.minAgeMonths! ? c : best)).id;
}

type CandidateRow = {
  animal_id: string;
  birth_date: string;
  sex: "male" | "female";
  current_category_id: string;
  current_farm_id: string | null;
  current_category_source: string | null;
};

export type AgeRecategorizationCandidate = {
  animalId: string;
  farmId: string;
  currentCategoryId: string;
  targetCategoryId: string;
};

// Only animals whose CURRENT category is itself age-managed (min_age_months
// set) are ever considered — a category with no age configured is
// manual-only by definition and is never entered or left automatically.
// Among those, an animal is skipped if its most recent recategorize event
// was a human override (source = 'manual'); it's included if that event was
// 'initial' or 'auto_age', or if it has no recategorize event's source at
// all is impossible here since the join to category via
// animal_current_state.current_category_id already requires one to exist.
export async function findAnimalsNeedingAgeRecategorization(
  asOfDate: string
): Promise<AgeRecategorizationCandidate[]> {
  const ageManagedCategories = await db
    .select({ id: category.id, sex: category.sex, minAgeMonths: category.minAgeMonths })
    .from(category)
    .where(isNotNull(category.minAgeMonths));
  if (ageManagedCategories.length === 0) return [];

  const result = await db.execute<CandidateRow>(sql`
    select
      a.id as animal_id,
      a.birth_date,
      a.sex,
      acs.current_category_id,
      acs.current_farm_id,
      lr.source as current_category_source
    from animal a
    join animal_current_state acs on acs.animal_id = a.id
    join category c on c.id = acs.current_category_id
    left join lateral (
      select r.source
      from event e
      join event_recategorize r on r.event_id = e.id
      where e.animal_id = a.id
        and e.event_type = 'recategorize'
        and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id)
      order by e.event_date desc, e.created_at desc
      limit 1
    ) lr on true
    where a.birth_date is not null
      and a.sex is not null
      and acs.status = 'alive'
      and c.min_age_months is not null
  `);

  const minAgeMonthsById = new Map(ageManagedCategories.map((c) => [c.id, c.minAgeMonths]));

  const candidates: AgeRecategorizationCandidate[] = [];
  for (const row of result.rows) {
    if (row.current_category_source === "manual") continue;
    if (!row.current_farm_id) continue;

    const ageMonths = computeAgeMonths(row.birth_date, asOfDate);
    const targetCategoryId = resolveCategoryForAge(ageManagedCategories, row.sex, ageMonths);
    if (!targetCategoryId || targetCategoryId === row.current_category_id) continue;

    // Only ever move an animal UP into a bracket with a higher minAgeMonths
    // than its current one — this job ages animals forward, never backward.
    // (A lower-ranked "target" can only arise from inconsistent data, e.g. a
    // manual assignment into a bracket the animal hasn't technically reached
    // yet; that's not this job's business to correct.)
    const currentMinAgeMonths = minAgeMonthsById.get(row.current_category_id);
    const targetMinAgeMonths = minAgeMonthsById.get(targetCategoryId);
    if (
      currentMinAgeMonths === undefined ||
      targetMinAgeMonths === undefined ||
      targetMinAgeMonths === null ||
      currentMinAgeMonths === null ||
      targetMinAgeMonths <= currentMinAgeMonths
    ) {
      continue;
    }

    candidates.push({
      animalId: row.animal_id,
      farmId: row.current_farm_id,
      currentCategoryId: row.current_category_id,
      targetCategoryId,
    });
  }
  return candidates;
}

export async function runAgeBasedRecategorization(input?: {
  asOfDate?: string;
}): Promise<{ recategorized: number }> {
  const asOfDate = input?.asOfDate ?? new Date().toISOString().slice(0, 10);
  const systemUserId = await getOrCreateSystemUser();
  const candidates = await findAnimalsNeedingAgeRecategorization(asOfDate);
  if (candidates.length === 0) return { recategorized: 0 };

  const byFarm = new Map<string, AgeRecategorizationCandidate[]>();
  for (const candidate of candidates) {
    const list = byFarm.get(candidate.farmId) ?? [];
    list.push(candidate);
    byFarm.set(candidate.farmId, list);
  }

  // Each farm gets its own transaction so a failure in one farm (e.g. a
  // constraint violation on a single animal) can't roll back every other
  // farm's already-succeeded writes — critical for the first "big-bang" run
  // against years of historical data across many farms.
  let recategorized = 0;
  for (const [farmId, animals] of byFarm) {
    try {
      await db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(batchOperation)
          .values({ eventType: "recategorize", farmId, animalCount: animals.length, createdBy: systemUserId })
          .returning();

        for (const candidate of animals) {
          const [createdEvent] = await tx
            .insert(event)
            .values({
              eventType: "recategorize",
              eventDate: asOfDate,
              animalId: candidate.animalId,
              farmId,
              batchOperationId: batch.id,
              createdBy: systemUserId,
            })
            .returning();
          await tx.insert(eventRecategorize).values({
            eventId: createdEvent.id,
            oldCategoryId: candidate.currentCategoryId,
            newCategoryId: candidate.targetCategoryId,
            source: "auto_age",
          });
        }
      });
      recategorized += animals.length;
    } catch (error) {
      logError("runAgeBasedRecategorization.farmFailed", error, { farmId });
    }
  }

  // Runs once outside any transaction, after all farms have been attempted,
  // so successfully-written farms' data becomes visible even if other farms
  // failed above.
  await db.execute(sql`refresh materialized view concurrently animal_current_state`);

  return { recategorized };
}
