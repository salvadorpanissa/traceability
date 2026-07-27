import { inArray, isNotNull, sql } from "drizzle-orm";
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
      status: "existing";
      animalId: string;
      currentFarmId: string;
      currentCategoryId: string;
      currentCategoryName: string | null;
      sex: "male" | "female" | null;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      status: "age-resolved";
      animalId: string;
      currentFarmId: string;
      resolvedCategoryId: string;
      resolvedCategoryName: string;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      status: "age-unresolvable";
      animalId: string;
      currentFarmId: string;
      sex: "male" | "female" | null;
    }
  | { tag: string; eventDate: string; notes: string | null; status: "error"; reason: string };

function resolveEventDate(rowDate: string | null, formEventDate: string | null): string | null {
  if (rowDate) {
    const normalized = normalizeDate(rowDate);
    if (normalized) return normalized;
  }
  return formEventDate;
}

type CurrentStateRow = {
  current_farm_id: string | null;
  current_category_id: string | null;
  category_name: string | null;
  status: string;
  birth_date: string | null;
  sex: "male" | "female" | null;
};

export async function resolveRecategorizeBatchRows(
  rows: MappedRow[],
  formEventDate: string | null
): Promise<RecategorizeResolvedRow[]> {
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
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

  const ageManagedCategories = await db
    .select({ id: category.id, name: category.name, sex: category.sex, minAgeMonths: category.minAgeMonths })
    .from(category)
    .where(isNotNull(category.minAgeMonths));
  const ageManagedCategoryNameById = new Map(ageManagedCategories.map((c) => [c.id, c.name]));

  const result: RecategorizeResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);
    const notes = row.notes;

    if (!eventDate) {
      result.push({ tag: row.tag, eventDate: "", notes, status: "error", reason: "Falta la fecha" });
      continue;
    }
    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }

    const animalId = animalIdByTag.get(row.tag);
    if (!animalId) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Caravana no encontrada" });
      continue;
    }

    const stateResult = await db.execute<CurrentStateRow>(sql`
      select acs.current_farm_id, acs.current_category_id, c.name as category_name, acs.status,
             a.birth_date, a.sex
      from animal_current_state acs
      left join category c on c.id = acs.current_category_id
      join animal a on a.id = acs.animal_id
      where acs.animal_id = ${animalId}
    `);
    const state = stateResult.rows[0];

    if (!state || state.status !== "alive") {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "El animal está vendido o muerto" });
      continue;
    }
    if (!state.current_farm_id) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "El animal no tiene campo asignado" });
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
            status: "age-resolved",
            animalId,
            currentFarmId: state.current_farm_id,
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
        status: "age-unresolvable",
        animalId,
        currentFarmId: state.current_farm_id,
        sex: state.sex,
      });
      continue;
    }

    result.push({
      tag: row.tag,
      eventDate,
      notes,
      status: "existing",
      animalId,
      currentFarmId: state.current_farm_id,
      currentCategoryId: state.current_category_id,
      currentCategoryName: state.category_name,
      sex: state.sex,
    });
  }

  return result;
}
