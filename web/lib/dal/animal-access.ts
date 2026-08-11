import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, userEstablishmentIds } from "@/lib/dal/farm-access";

// A manager may move animals between two different campos only when they're
// assigned to both — moving into or out of a campo they don't manage still
// requires an admin, since that's effectively granting them reach over a
// campo outside their own assignment.
export async function requireTransferAuthorization(
  userId: string,
  role: string | undefined,
  originEstablishmentId: string,
  destinationEstablishmentId: string
): Promise<void> {
  if (originEstablishmentId === destinationEstablishmentId) return;
  if (isAdmin(role)) return;
  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.includes(originEstablishmentId) && establishmentIds.includes(destinationEstablishmentId)) return;
  throw new Error("No tenés acceso a ambos campos para crear este traslado");
}

export type AnimalCurrentState = {
  animalId: string;
  currentTag: string | null;
  currentEstablishmentId: string | null;
  currentCategoryId: string | null;
  status: string;
};

type CurrentStateRow = {
  animal_id: string;
  current_tag: string | null;
  current_establishment_id: string | null;
  current_category_id: string | null;
  status: string;
};

function toAnimalCurrentState(row: CurrentStateRow): AnimalCurrentState {
  return {
    animalId: row.animal_id,
    currentTag: row.current_tag,
    currentEstablishmentId: row.current_establishment_id,
    currentCategoryId: row.current_category_id,
    status: row.status,
  };
}

export async function visibleCurrentState(userId: string, role: string | undefined): Promise<AnimalCurrentState[]> {
  if (isAdmin(role)) {
    const result = await db.execute<CurrentStateRow>(sql`select * from animal_current_state`);
    return result.rows.map(toAnimalCurrentState);
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return [];

  const establishmentIdList = sql.join(
    establishmentIds.map((establishmentId) => sql`${establishmentId}`),
    sql`, `
  );
  const result = await db.execute<CurrentStateRow>(
    sql`select * from animal_current_state where current_establishment_id in (${establishmentIdList})`
  );
  return result.rows.map(toAnimalCurrentState);
}

export type AnimalCurrentStateWithNames = {
  animalId: string;
  currentTag: string | null;
  currentEstablishmentId: string | null;
  establishmentName: string | null;
  currentPaddockId: string | null;
  paddockName: string | null;
  currentCategoryId: string | null;
  categoryName: string | null;
  status: string;
};

type CurrentStateWithNamesRow = {
  animal_id: string;
  current_tag: string | null;
  current_establishment_id: string | null;
  establishment_name: string | null;
  current_paddock_id: string | null;
  paddock_name: string | null;
  current_category_id: string | null;
  category_name: string | null;
  status: string;
};

function toAnimalCurrentStateWithNames(row: CurrentStateWithNamesRow): AnimalCurrentStateWithNames {
  return {
    animalId: row.animal_id,
    currentTag: row.current_tag,
    currentEstablishmentId: row.current_establishment_id,
    establishmentName: row.establishment_name,
    currentPaddockId: row.current_paddock_id,
    paddockName: row.paddock_name,
    currentCategoryId: row.current_category_id,
    categoryName: row.category_name,
    status: row.status,
  };
}

const CURRENT_STATE_WITH_NAMES_SELECT = sql`
  select
    acs.animal_id,
    acs.current_tag,
    acs.current_establishment_id,
    e.name as establishment_name,
    acs.current_paddock_id,
    p.name as paddock_name,
    acs.current_category_id,
    c.name as category_name,
    acs.status
  from animal_current_state acs
  left join establishment e on e.id = acs.current_establishment_id
  left join paddock p on p.id = acs.current_paddock_id
  left join category c on c.id = acs.current_category_id
`;

export async function visibleCurrentStateWithNames(
  userId: string,
  role: string | undefined
): Promise<AnimalCurrentStateWithNames[]> {
  if (isAdmin(role)) {
    const result = await db.execute<CurrentStateWithNamesRow>(CURRENT_STATE_WITH_NAMES_SELECT);
    return result.rows.map(toAnimalCurrentStateWithNames);
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return [];

  const establishmentIdList = sql.join(
    establishmentIds.map((establishmentId) => sql`${establishmentId}`),
    sql`, `
  );
  const result = await db.execute<CurrentStateWithNamesRow>(
    sql`${CURRENT_STATE_WITH_NAMES_SELECT} where acs.current_establishment_id in (${establishmentIdList})`
  );
  return result.rows.map(toAnimalCurrentStateWithNames);
}

// Looks a tag up in animal_tag_history (not just the current one) so a
// caravana that was later retagged is still found — the caller can tell
// from currentTag whether it no longer matches what was searched. Scoped
// the same way as visibleCurrentStateWithNames: a foreign-establecimiento
// animal comes back as not-found rather than "found but no access", since
// the WHERE clause filters before any row is returned.
export async function findAnimalLocationByTag(
  userId: string,
  role: string | undefined,
  tag: string
): Promise<AnimalCurrentStateWithNames | null> {
  const base = sql`
    select
      acs.animal_id,
      acs.current_tag,
      acs.current_establishment_id,
      e.name as establishment_name,
      acs.current_paddock_id,
      p.name as paddock_name,
      acs.current_category_id,
      c.name as category_name,
      acs.status
    from animal_tag_history ath
    join animal_current_state acs on acs.animal_id = ath.animal_id
    left join establishment e on e.id = acs.current_establishment_id
    left join paddock p on p.id = acs.current_paddock_id
    left join category c on c.id = acs.current_category_id
    where ath.tag = ${tag}
  `;

  if (isAdmin(role)) {
    const result = await db.execute<CurrentStateWithNamesRow>(sql`${base} limit 1`);
    return result.rows[0] ? toAnimalCurrentStateWithNames(result.rows[0]) : null;
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return null;

  const establishmentIdList = sql.join(
    establishmentIds.map((establishmentId) => sql`${establishmentId}`),
    sql`, `
  );
  const result = await db.execute<CurrentStateWithNamesRow>(
    sql`${base} and acs.current_establishment_id in (${establishmentIdList}) limit 1`
  );
  return result.rows[0] ? toAnimalCurrentStateWithNames(result.rows[0]) : null;
}

export type AnimalLookupDetail = AnimalCurrentStateWithNames & {
  sex: "male" | "female" | null;
  breed: string | null;
  birthDate: string | null;
  ownerName: string | null;
  secondaryTag: string | null;
};

type AnimalLookupDetailRow = CurrentStateWithNamesRow & {
  sex: "male" | "female" | null;
  breed: string | null;
  birth_date: string | null;
  owner_name: string | null;
  secondary_tag: string | null;
};

function toAnimalLookupDetail(row: AnimalLookupDetailRow): AnimalLookupDetail {
  return {
    ...toAnimalCurrentStateWithNames(row),
    sex: row.sex,
    breed: row.breed,
    birthDate: row.birth_date,
    ownerName: row.owner_name,
    secondaryTag: row.secondary_tag,
  };
}

const CURRENT_STATE_WITH_DETAILS_SELECT = sql`
  select
    acs.animal_id,
    acs.current_tag,
    acs.current_establishment_id,
    e.name as establishment_name,
    acs.current_paddock_id,
    p.name as paddock_name,
    acs.current_category_id,
    c.name as category_name,
    acs.status,
    a.sex,
    a.breed,
    a.birth_date,
    o.name as owner_name,
    (
      select ath2.secondary_tag
      from animal_tag_history ath2
      where ath2.animal_id = acs.animal_id
      order by ath2.valid_from desc
      limit 1
    ) as secondary_tag
  from animal_current_state acs
  left join establishment e on e.id = acs.current_establishment_id
  left join paddock p on p.id = acs.current_paddock_id
  left join category c on c.id = acs.current_category_id
  left join animal a on a.id = acs.animal_id
  left join owner o on o.id = a.owner_id
`;

// Same shape and per-animal fields as findAnimalDetailByTag, but for every
// visible animal instead of a single tag lookup — used by dashboard
// summaries (e.g. the by-potrero breakdown) that need owner/sex/breed/birth
// date/secondary tag alongside each animal, not just its tag.
export async function visibleAnimalDetails(userId: string, role: string | undefined): Promise<AnimalLookupDetail[]> {
  if (isAdmin(role)) {
    const result = await db.execute<AnimalLookupDetailRow>(CURRENT_STATE_WITH_DETAILS_SELECT);
    return result.rows.map(toAnimalLookupDetail);
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return [];

  const establishmentIdList = sql.join(
    establishmentIds.map((establishmentId) => sql`${establishmentId}`),
    sql`, `
  );
  const result = await db.execute<AnimalLookupDetailRow>(
    sql`${CURRENT_STATE_WITH_DETAILS_SELECT} where acs.current_establishment_id in (${establishmentIdList})`
  );
  return result.rows.map(toAnimalLookupDetail);
}

// Same tag resolution and establecimiento scoping as findAnimalLocationByTag,
// plus the animal-level fields (owner/sex/breed/birth date/secondary tag)
// that live on `animal`/`animal_tag_history` rather than the derived-state
// view — kept as its own query instead of widening findAnimalLocationByTag's
// shared return shape, since that one is also used by the death activity,
// which has no use for these extra fields.
export async function findAnimalDetailByTag(
  userId: string,
  role: string | undefined,
  tag: string
): Promise<AnimalLookupDetail | null> {
  const base = sql`
    select
      acs.animal_id,
      acs.current_tag,
      acs.current_establishment_id,
      e.name as establishment_name,
      acs.current_paddock_id,
      p.name as paddock_name,
      acs.current_category_id,
      c.name as category_name,
      acs.status,
      a.sex,
      a.breed,
      a.birth_date,
      o.name as owner_name,
      (
        select ath2.secondary_tag
        from animal_tag_history ath2
        where ath2.animal_id = acs.animal_id
        order by ath2.valid_from desc
        limit 1
      ) as secondary_tag
    from animal_tag_history ath
    join animal_current_state acs on acs.animal_id = ath.animal_id
    left join establishment e on e.id = acs.current_establishment_id
    left join paddock p on p.id = acs.current_paddock_id
    left join category c on c.id = acs.current_category_id
    left join animal a on a.id = acs.animal_id
    left join owner o on o.id = a.owner_id
    where ath.tag = ${tag}
  `;

  if (isAdmin(role)) {
    const result = await db.execute<AnimalLookupDetailRow>(sql`${base} limit 1`);
    return result.rows[0] ? toAnimalLookupDetail(result.rows[0]) : null;
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return null;

  const establishmentIdList = sql.join(
    establishmentIds.map((establishmentId) => sql`${establishmentId}`),
    sql`, `
  );
  const result = await db.execute<AnimalLookupDetailRow>(
    sql`${base} and acs.current_establishment_id in (${establishmentIdList}) limit 1`
  );
  return result.rows[0] ? toAnimalLookupDetail(result.rows[0]) : null;
}
