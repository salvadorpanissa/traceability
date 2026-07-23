import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, category, owner, ownTag, dicoseRegistration, farm } from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";
import { normalizeSex } from "@/lib/activities/sex-normalization";
import { normalizeDate } from "@/lib/activities/date-normalization";

export type ResolvedRow = { tag: string; eventDate: string; notes: string | null } & (
  | { status: "existing"; animalId: string; currentFarmId: string | null; currentPaddockId: string | null }
  | {
      status: "new";
      categoryId: string | null;
      sex: "male" | "female" | null;
      birthDate: string | null;
      ownerId: string | null;
      pendingOwnerName: string | null;
    }
  | {
      status: "wrong_farm";
      categoryId: string | null;
      sex: "male" | "female" | null;
      birthDate: string | null;
      ownerId: string;
      registeredFarmId: string;
      registeredFarmName: string;
    }
  | {
      status: "foreign";
      forced: boolean;
      categoryId: string | null;
      sex: "male" | "female" | null;
      birthDate: string | null;
      ownerId: string | null;
      pendingOwnerName: string | null;
    }
  | { status: "error"; reason: string }
);

export type CreatableRow = Extract<ResolvedRow, { status: "new" | "wrong_farm" | "foreign" }>;

function resolveEventDate(rowDate: string | null, formEventDate: string | null): string | null {
  if (rowDate) {
    const normalized = normalizeDate(rowDate);
    if (normalized) return normalized;
  }
  return formEventDate;
}

type CurrentStateRow = { current_farm_id: string | null; current_paddock_id: string | null; status: string };

export async function resolveBatchRows(
  rows: MappedRow[],
  formEventDate: string | null,
  operatingFarmId: string
): Promise<ResolvedRow[]> {
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

  const categoryRows = await db.select({ id: category.id, name: category.name }).from(category);
  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

  const ownerRows = await db.select({ id: owner.id, name: owner.name }).from(owner);
  const ownerIdByName = new Map(ownerRows.map((o) => [o.name.trim().toLowerCase(), o.id]));

  const ownTagRows =
    nonEmptyTags.length > 0
      ? await db
          .select({
            tag: ownTag.tag,
            ownerId: dicoseRegistration.ownerId,
            farmId: dicoseRegistration.farmId,
            farmName: farm.name,
          })
          .from(ownTag)
          .innerJoin(dicoseRegistration, eq(dicoseRegistration.id, ownTag.dicoseRegistrationId))
          .innerJoin(farm, eq(farm.id, dicoseRegistration.farmId))
          .where(inArray(ownTag.tag, nonEmptyTags))
      : [];
  const ownTagByTag = new Map(ownTagRows.map((r) => [r.tag, r]));

  const result: ResolvedRow[] = [];
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
    if (animalId) {
      const stateResult = await db.execute<CurrentStateRow>(
        sql`select current_farm_id, current_paddock_id, status from animal_current_state where animal_id = ${animalId}`
      );
      const state = stateResult.rows[0];
      if (state && state.status !== "alive") {
        result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "El animal está vendido o muerto" });
        continue;
      }
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "existing",
        animalId,
        currentFarmId: state?.current_farm_id ?? null,
        currentPaddockId: state?.current_paddock_id ?? null,
      });
      continue;
    }

    let categoryId: string | null = null;
    if (row.category) {
      const matchedCategoryId = categoryIdByName.get(row.category);
      if (!matchedCategoryId) {
        result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Categoría no reconocida" });
        continue;
      }
      categoryId = matchedCategoryId;
    }

    // own_tag is a pure ownership registry now (no sex/category/birth date) —
    // this batch's own columns are the only source for those fields.
    const ownTagMatch = ownTagByTag.get(row.tag);
    const sex = normalizeSex(row.sex);
    const birthDate: string | null = null;

    if (!ownTagMatch) {
      let ownerId: string | null = null;
      let pendingOwnerName: string | null = null;
      if (row.ownerName) {
        const matchedOwnerId = ownerIdByName.get(row.ownerName.trim().toLowerCase());
        if (matchedOwnerId) {
          ownerId = matchedOwnerId;
        } else {
          pendingOwnerName = row.ownerName.trim();
        }
      }
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "foreign",
        forced: false,
        categoryId,
        sex,
        birthDate,
        ownerId,
        pendingOwnerName,
      });
      continue;
    }

    if (ownTagMatch.farmId === operatingFarmId) {
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "new",
        categoryId,
        sex,
        birthDate,
        ownerId: ownTagMatch.ownerId,
        pendingOwnerName: null,
      });
    } else {
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "wrong_farm",
        categoryId,
        sex,
        birthDate,
        ownerId: ownTagMatch.ownerId,
        registeredFarmId: ownTagMatch.farmId,
        registeredFarmName: ownTagMatch.farmName,
      });
    }
  }

  return result;
}
