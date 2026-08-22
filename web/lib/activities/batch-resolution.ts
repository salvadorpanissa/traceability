import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, category, owner, ownTag, dicose, establishment } from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";
import { normalizeSex } from "@/lib/activities/sex-normalization";
import { normalizeDate } from "@/lib/activities/date-normalization";

export type ResolvedRow = {
  tag: string;
  eventDate: string;
  notes: string | null;
  secondaryTag?: string | null;
  breed?: string | null;
  reproductiveStatusId?: string | null;
} & (
  | { status: "existing"; animalId: string; currentEstablishmentId: string | null; currentPaddockId: string | null }
  | {
      status: "new";
      categoryId: string | null;
      sex: "male" | "female" | null;
      birthDate: string | null;
      ownerId: string | null;
      pendingOwnerName: string | null;
    }
  | {
      status: "wrong_establishment";
      categoryId: string | null;
      sex: "male" | "female" | null;
      birthDate: string | null;
      ownerId: string;
      registeredEstablishmentId: string;
      registeredEstablishmentName: string;
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

export type CreatableRow = Extract<ResolvedRow, { status: "new" | "wrong_establishment" | "foreign" }>;

function resolveEventDate(rowDate: string | null, formEventDate: string | null): string | null {
  if (rowDate) {
    const normalized = normalizeDate(rowDate);
    if (normalized) return normalized;
  }
  return formEventDate;
}

type CurrentStateRow = { current_establishment_id: string | null; current_paddock_id: string | null; status: string };

export async function resolveBatchRows(
  rows: MappedRow[],
  formEventDate: string | null,
  operatingEstablishmentId: string,
  options?: { autoForceForeignWithoutOwner?: boolean }
): Promise<ResolvedRow[]> {
  const autoForceForeignWithoutOwner = options?.autoForceForeignWithoutOwner ?? false;
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

  // Also looked up against the row's own tag: a tag reader sometimes only
  // picks up an animal's chip (secondary tag) — e.g. the ear tag was lost —
  // so a "caravana" column value that matches no primary tag may still
  // match a known secondary one.
  const nonEmptySecondaryTags = [
    ...new Set([...rows.map((r) => r.secondaryTag).filter((v): v is string => !!v), ...nonEmptyTags]),
  ];
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

  const [operatingEstablishment] = await db
    .select({ farmId: establishment.farmId })
    .from(establishment)
    .where(eq(establishment.id, operatingEstablishmentId));
  const categoryRows = operatingEstablishment
    ? await db.select({ id: category.id, name: category.name }).from(category).where(eq(category.farmId, operatingEstablishment.farmId))
    : [];
  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

  // Scoped to the operating establishment's farm — a name match against an
  // unrelated farm's owner isn't a meaningful signal that the animal is ours.
  const ownerRows = operatingEstablishment
    ? await db.select({ id: owner.id, name: owner.name }).from(owner).where(eq(owner.farmId, operatingEstablishment.farmId))
    : [];
  const ownerIdByName = new Map(ownerRows.map((o) => [o.name.trim().toLowerCase(), o.id]));

  const ownTagRows =
    nonEmptyTags.length > 0
      ? await db
          .select({
            tag: ownTag.tag,
            ownerId: dicose.ownerId,
            establishmentId: dicose.establishmentId,
            establishmentName: establishment.name,
          })
          .from(ownTag)
          .innerJoin(dicose, eq(dicose.id, ownTag.dicoseId))
          .innerJoin(establishment, eq(establishment.id, dicose.establishmentId))
          .where(inArray(ownTag.tag, nonEmptyTags))
      : [];
  const ownTagByTag = new Map(ownTagRows.map((r) => [r.tag, r]));

  const result: ResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);
    const notes = row.notes;
    const secondaryTag = row.secondaryTag ?? null;
    const breed = row.breed ?? null;
    const reproductiveStatusId = row.reproductiveStatusId ?? null;

    if (!eventDate) {
      result.push({ tag: row.tag, eventDate: "", notes, secondaryTag, breed, reproductiveStatusId, status: "error", reason: "Falta la fecha" });
      continue;
    }

    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, reproductiveStatusId, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, reproductiveStatusId, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }
    if (secondaryTag && (secondaryTagCounts.get(secondaryTag) ?? 0) > 1) {
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        secondaryTag,
        breed,
        reproductiveStatusId,
        status: "error",
        reason: "Chip secundario duplicado en el archivo",
      });
      continue;
    }

    const animalId = animalIdByTag.get(row.tag) ?? animalIdBySecondaryTag.get(row.tag);

    if (secondaryTag) {
      const secondaryTagOwnerId = animalIdBySecondaryTag.get(secondaryTag);
      if (secondaryTagOwnerId && secondaryTagOwnerId !== animalId) {
        result.push({
          tag: row.tag,
          eventDate,
          notes,
          secondaryTag,
          breed,
          reproductiveStatusId,
          status: "error",
          reason: "Chip secundario ya asignado a otro animal",
        });
        continue;
      }
    }

    if (animalId) {
      const stateResult = await db.execute<CurrentStateRow>(
        sql`select current_establishment_id, current_paddock_id, status from animal_current_state where animal_id = ${animalId}`
      );
      const state = stateResult.rows[0];
      if (state && state.status !== "alive") {
        result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, reproductiveStatusId, status: "error", reason: "El animal está vendido o muerto" });
        continue;
      }
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        secondaryTag,
        breed,
        reproductiveStatusId,
        status: "existing",
        animalId,
        currentEstablishmentId: state?.current_establishment_id ?? null,
        currentPaddockId: state?.current_paddock_id ?? null,
      });
      continue;
    }

    let categoryId: string | null = null;
    if (row.category) {
      const matchedCategoryId = categoryIdByName.get(row.category);
      if (!matchedCategoryId) {
        result.push({ tag: row.tag, eventDate, notes, secondaryTag, breed, reproductiveStatusId, status: "error", reason: "Categoría no reconocida" });
        continue;
      }
      categoryId = matchedCategoryId;
    }

    // own_tag is a pure ownership registry now (no sex/category/birth date) —
    // this batch's own columns are the only source for those fields.
    const ownTagMatch = ownTagByTag.get(row.tag);
    const sex = normalizeSex(row.sex);
    const birthDate: string | null = row.birthDate ?? null;

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

      // Not in DICOSE, but the row's owner column names one of this farm's
      // own owners — as good a signal that the animal is ours as a DICOSE
      // registration, e.g. for a tag freshly put on and not yet registered.
      if (ownerId) {
        result.push({
          tag: row.tag,
          eventDate,
          notes,
          secondaryTag,
          breed,
          reproductiveStatusId,
          status: "new",
          categoryId,
          sex,
          birthDate,
          ownerId,
          pendingOwnerName: null,
        });
        continue;
      }

      // A row with no owner name at all has nothing pending to review — force
      // it in as "ajena" automatically instead of making the user tick the
      // per-row checkbox. A row that does carry an owner name (unmatched, so
      // pending) still goes through the normal manual-confirm path.
      const forced = autoForceForeignWithoutOwner && !row.ownerName;
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        secondaryTag,
        breed,
        reproductiveStatusId,
        status: "foreign",
        forced,
        categoryId,
        sex,
        birthDate,
        ownerId,
        pendingOwnerName,
      });
      continue;
    }

    if (ownTagMatch.establishmentId === operatingEstablishmentId) {
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        secondaryTag,
        breed,
        reproductiveStatusId,
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
        secondaryTag,
        breed,
        reproductiveStatusId,
        status: "wrong_establishment",
        categoryId,
        sex,
        birthDate,
        ownerId: ownTagMatch.ownerId,
        registeredEstablishmentId: ownTagMatch.establishmentId,
        registeredEstablishmentName: ownTagMatch.establishmentName,
      });
    }
  }

  return result;
}
