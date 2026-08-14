import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, category } from "@/db/schema";
import { normalizeDate } from "@/lib/activities/date-normalization";
import { computeAgeMonths, resolveCategoryForAge } from "@/lib/activities/age-recategorization";
import type { MappedRow } from "@/lib/activities/column-mapping";

export type UnresolvableDecision = "skip" | "assignTarget";

export type RecategorizeResolvedRow =
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      secondaryTag?: string | null;
      breed?: string | null;
      status: "existing";
      animalId: string;
      currentEstablishmentId: string;
      currentCategoryId: string;
      currentCategoryName: string | null;
      sex: "male" | "female" | null;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      secondaryTag?: string | null;
      breed?: string | null;
      status: "age-resolved";
      animalId: string;
      currentEstablishmentId: string;
      resolvedCategoryId: string;
      resolvedCategoryName: string;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      secondaryTag?: string | null;
      breed?: string | null;
      status: "age-unresolvable";
      animalId: string;
      currentEstablishmentId: string;
      sex: "male" | "female" | null;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      secondaryTag?: string | null;
      breed?: string | null;
      status: "error";
      reason: string;
    };

function resolveEventDate(rowDate: string | null, formEventDate: string | null): string | null {
  if (rowDate) {
    const normalized = normalizeDate(rowDate);
    if (normalized) return normalized;
  }
  return formEventDate;
}

type CurrentStateRow = {
  current_establishment_id: string | null;
  current_farm_id: string | null;
  current_category_id: string | null;
  category_name: string | null;
  status: string;
  birth_date: string | null;
  sex: "male" | "female" | null;
};

export async function resolveRecategorizeBatchRows(
  rows: MappedRow[],
  formEventDate: string | null,
  farmId: string
): Promise<RecategorizeResolvedRow[]> {
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
  }

  const secondaryTagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.secondaryTag) continue;
    secondaryTagCounts.set(row.secondaryTag, (secondaryTagCounts.get(row.secondaryTag) ?? 0) + 1);
  }

  const nonEmptyTags = rows.map((r) => r.tag).filter((tag) => tag.length > 0);
  const tagHistoryRows =
    nonEmptyTags.length > 0
      ? await db
          .select({ tag: animalTagHistory.tag, animalId: animalTagHistory.animalId })
          .from(animalTagHistory)
          .where(inArray(animalTagHistory.tag, nonEmptyTags))
      : [];
  const animalIdByTag = new Map(tagHistoryRows.map((r) => [r.tag, r.animalId]));

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

  const ageManagedCategories = await db
    .select({ id: category.id, name: category.name, sex: category.sex, minAgeMonths: category.minAgeMonths })
    .from(category)
    .where(and(isNotNull(category.minAgeMonths), eq(category.farmId, farmId)));
  const ageManagedCategoryNameById = new Map(ageManagedCategories.map((c) => [c.id, c.name]));

  const result: RecategorizeResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);
    const notes = row.notes;
    const secondaryTag = row.secondaryTag ?? null;
    const breed = row.breed ?? null;

    if (!eventDate) {
      result.push({ tag: row.tag, eventDate: "", notes, secondaryTag, breed, status: "error", reason: "Falta la fecha" });
      continue;
    }
    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }
    if (secondaryTag && (secondaryTagCounts.get(secondaryTag) ?? 0) > 1) {
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        secondaryTag,
        breed,
        status: "error",
        reason: "Chip secundario duplicado en el archivo",
      });
      continue;
    }

    const animalId = animalIdByTag.get(row.tag);

    if (secondaryTag) {
      const secondaryTagOwnerId = animalIdBySecondaryTag.get(secondaryTag);
      if (secondaryTagOwnerId && secondaryTagOwnerId !== animalId) {
        result.push({
          tag: row.tag,
          eventDate,
          notes,
          secondaryTag,
          breed,
          status: "error",
          reason: "Chip secundario ya asignado a otro animal",
        });
        continue;
      }
    }

    if (!animalId) {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, status: "error", reason: "Caravana no encontrada" });
      continue;
    }

    const stateResult = await db.execute<CurrentStateRow>(sql`
      select acs.current_establishment_id, e.farm_id as current_farm_id, acs.current_category_id,
             c.name as category_name, acs.status, a.birth_date, a.sex
      from animal_current_state acs
      left join category c on c.id = acs.current_category_id
      left join establishment e on e.id = acs.current_establishment_id
      join animal a on a.id = acs.animal_id
      where acs.animal_id = ${animalId}
    `);
    const state = stateResult.rows[0];

    if (!state || state.status !== "alive") {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, status: "error", reason: "El animal está vendido o muerto" });
      continue;
    }
    if (!state.current_establishment_id) {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, status: "error", reason: "El animal no tiene campo asignado" });
      continue;
    }
    if (state.current_farm_id !== farmId) {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, status: "error", reason: "El animal no pertenece a este grupo de campos" });
      continue;
    }

    if (!state.current_category_id) {
      if (state.birth_date && state.sex) {
        const ageMonths = computeAgeMonths(state.birth_date, eventDate);
        const resolvedCategoryId = resolveCategoryForAge(ageManagedCategories, state.sex, ageMonths);
        if (resolvedCategoryId) {
          result.push({
            tag: row.tag,
            eventDate,
            notes,
            secondaryTag,
            breed,
            status: "age-resolved",
            animalId,
            currentEstablishmentId: state.current_establishment_id,
            resolvedCategoryId,
            resolvedCategoryName: ageManagedCategoryNameById.get(resolvedCategoryId) ?? "",
          });
          continue;
        }
      }
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        secondaryTag,
        breed,
        status: "age-unresolvable",
        animalId,
        currentEstablishmentId: state.current_establishment_id,
        sex: state.sex,
      });
      continue;
    }

    result.push({
      tag: row.tag,
      eventDate,
      notes,
      secondaryTag,
      breed,
      status: "existing",
      animalId,
      currentEstablishmentId: state.current_establishment_id,
      currentCategoryId: state.current_category_id,
      currentCategoryName: state.category_name,
      sex: state.sex,
    });
  }

  return result;
}
