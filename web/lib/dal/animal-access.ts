import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animal, animalTagHistory } from "@/db/schema";
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

// Tags of every animal currently living in a potrero — used to warn when a
// sanidad batch leaves out an animal that officially belongs there.
export async function listTagsInPaddock(paddockId: string): Promise<string[]> {
  const result = await db.execute<{ current_tag: string | null }>(sql`
    select current_tag
    from animal_current_state
    where current_paddock_id = ${paddockId} and status = 'alive'
  `);
  return result.rows.map((r) => r.current_tag).filter((tag): tag is string => tag !== null);
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
  notes: string | null;
  reproductiveStatusId: string | null;
  reproductiveStatusName: string | null;
  latestWeightKg: string | null;
};

type AnimalLookupDetailRow = CurrentStateWithNamesRow & {
  sex: "male" | "female" | null;
  breed: string | null;
  birth_date: string | null;
  owner_name: string | null;
  secondary_tag: string | null;
  notes: string | null;
  reproductive_status_id: string | null;
  reproductive_status_name: string | null;
  latest_weight_kg: string | null;
};

function toAnimalLookupDetail(row: AnimalLookupDetailRow): AnimalLookupDetail {
  return {
    ...toAnimalCurrentStateWithNames(row),
    sex: row.sex,
    breed: row.breed,
    birthDate: row.birth_date,
    ownerName: row.owner_name,
    secondaryTag: row.secondary_tag,
    notes: row.notes,
    reproductiveStatusId: row.reproductive_status_id,
    reproductiveStatusName: row.reproductive_status_name,
    latestWeightKg: row.latest_weight_kg,
  };
}

// Most recent non-voided pesaje for the animal — same voided-event exclusion
// as NOTES_SUBQUERY, latest by event_date/created_at like the secondary_tag
// subquery.
const LATEST_WEIGHT_SUBQUERY = sql`
  (
    select ep.weight_kg
    from event ev
    join event_pesaje ep on ep.event_id = ev.id
    where ev.animal_id = acs.animal_id
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = ev.id)
    order by ev.event_date desc, ev.created_at desc
    limit 1
  ) as latest_weight_kg
`;

// Every event note the animal has ever accumulated (transfer, health,
// recategorize, ...), oldest first — used where a single cell needs the
// animal's whole note history, e.g. the potrero Excel export.
const NOTES_SUBQUERY = sql`
  (
    select string_agg(ev.notes, ' | ' order by ev.event_date, ev.created_at)
    from event ev
    where ev.animal_id = acs.animal_id and ev.notes is not null
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = ev.id)
  ) as notes
`;

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
    ) as secondary_tag,
    a.reproductive_status_id,
    rs.name as reproductive_status_name,
    ${NOTES_SUBQUERY},
    ${LATEST_WEIGHT_SUBQUERY}
  from animal_current_state acs
  left join establishment e on e.id = acs.current_establishment_id
  left join paddock p on p.id = acs.current_paddock_id
  left join category c on c.id = acs.current_category_id
  left join animal a on a.id = acs.animal_id
  left join owner o on o.id = a.owner_id
  left join reproductive_status rs on rs.id = a.reproductive_status_id
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
      ) as secondary_tag,
      a.reproductive_status_id,
      rs.name as reproductive_status_name,
      ${NOTES_SUBQUERY},
      ${LATEST_WEIGHT_SUBQUERY}
    from animal_tag_history ath
    join animal_current_state acs on acs.animal_id = ath.animal_id
    left join establishment e on e.id = acs.current_establishment_id
    left join paddock p on p.id = acs.current_paddock_id
    left join category c on c.id = acs.current_category_id
    left join animal a on a.id = acs.animal_id
    left join owner o on o.id = a.owner_id
    left join reproductive_status rs on rs.id = a.reproductive_status_id
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

// Same shape as findAnimalDetailByTag, but keyed by the animal's permanent
// uuid instead of a tag — used by the /animals/[id] detail page, since a
// tag can change on a later retag while the id never does.
export async function findAnimalDetailById(
  userId: string,
  role: string | undefined,
  animalId: string
): Promise<AnimalLookupDetail | null> {
  if (isAdmin(role)) {
    const result = await db.execute<AnimalLookupDetailRow>(
      sql`${CURRENT_STATE_WITH_DETAILS_SELECT} where acs.animal_id = ${animalId}`
    );
    return result.rows[0] ? toAnimalLookupDetail(result.rows[0]) : null;
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return null;

  const establishmentIdList = sql.join(
    establishmentIds.map((establishmentId) => sql`${establishmentId}`),
    sql`, `
  );
  const result = await db.execute<AnimalLookupDetailRow>(
    sql`${CURRENT_STATE_WITH_DETAILS_SELECT} where acs.animal_id = ${animalId} and acs.current_establishment_id in (${establishmentIdList})`
  );
  return result.rows[0] ? toAnimalLookupDetail(result.rows[0]) : null;
}

export type AnimalTagHistoryEntry = {
  tag: string;
  secondaryTag: string | null;
  validFrom: Date;
};

// Every tag the animal has ever worn, newest first — for the detail page's
// tag-history table. Unguarded by establishment access: callers only reach
// here after findAnimalDetailById/findAnimalDetailByTag already confirmed
// the caller can see this animal.
export async function animalTagHistoryFor(animalId: string): Promise<AnimalTagHistoryEntry[]> {
  return db
    .select({
      tag: animalTagHistory.tag,
      secondaryTag: animalTagHistory.secondaryTag,
      validFrom: animalTagHistory.validFrom,
    })
    .from(animalTagHistory)
    .where(eq(animalTagHistory.animalId, animalId))
    .orderBy(desc(animalTagHistory.validFrom));
}

export type AnimalHealthNoteEntry = {
  eventDate: string;
  establishmentName: string | null;
  paddockName: string | null;
  productName: string;
  withdrawalEndDate: string | null;
  notes: string | null;
};

type AnimalHealthNoteRow = {
  event_date: string;
  establishment_name: string | null;
  paddock_name: string | null;
  product_name: string;
  withdrawal_end_date: string | null;
  notes: string | null;
};

// Sanidad (health) events are the only event type that carries a note
// alongside a campo/potrero, product, and withdrawal period, so sanidad
// entries shown on the detail page come only from here — not the flat,
// all-event-types aggregate on AnimalLookupDetail.notes. Includes events
// without a note too (notes can be null), since the detail page also uses
// the newest row here as "última sanidad" regardless of whether it has a
// note. The campo comes from the event's own establishment_id (where the
// animal was at the time of that sanidad), not the animal's current one.
// The withdrawal end date follows the same event_date + withdrawal_days
// computation as findPendingWithdrawals (lib/dal/health-withdrawal.ts).
// Unguarded by establishment access, same as animalTagHistoryFor: callers
// reach here only after findAnimalDetailById already confirmed the caller
// can see this animal.
export async function animalHealthNotesFor(animalId: string): Promise<AnimalHealthNoteEntry[]> {
  const result = await db.execute<AnimalHealthNoteRow>(sql`
    select
      ev.event_date,
      est.name as establishment_name,
      p.name as paddock_name,
      pr.name as product_name,
      (ev.event_date + eh.withdrawal_days) as withdrawal_end_date,
      ev.notes
    from event ev
    join event_health eh on eh.event_id = ev.id
    join product pr on pr.id = eh.product_id
    left join establishment est on est.id = ev.establishment_id
    left join paddock p on p.id = eh.paddock_id
    where ev.animal_id = ${animalId}
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = ev.id)
    order by ev.event_date desc, ev.created_at desc
  `);
  return result.rows.map((row) => ({
    eventDate: row.event_date,
    establishmentName: row.establishment_name,
    paddockName: row.paddock_name,
    productName: row.product_name,
    withdrawalEndDate: row.withdrawal_end_date,
    notes: row.notes,
  }));
}

export type AnimalPesajeEntry = {
  eventDate: string;
  weightKg: string;
  estimated: boolean;
};

type AnimalPesajeRow = {
  event_date: string;
  weight_kg: string;
  estimated: boolean;
};

// Every non-voided pesaje for one animal, newest first — same voided-event
// exclusion as animalHealthNotesFor. Unguarded by establishment access for
// the same reason: callers reach here only after findAnimalDetailById
// already confirmed the caller can see this animal.
export async function animalPesajesFor(animalId: string): Promise<AnimalPesajeEntry[]> {
  const result = await db.execute<AnimalPesajeRow>(sql`
    select ev.event_date, ep.weight_kg, ep.estimated
    from event ev
    join event_pesaje ep on ep.event_id = ev.id
    where ev.animal_id = ${animalId}
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = ev.id)
    order by ev.event_date desc, ev.created_at desc
  `);
  return result.rows.map((row) => ({
    eventDate: row.event_date,
    weightKg: row.weight_kg,
    estimated: row.estimated,
  }));
}

export type AnimalEditState = {
  establishmentId: string | null;
  categoryId: string | null;
  status: string;
};

type AnimalEditStateRow = {
  current_establishment_id: string | null;
  current_category_id: string | null;
  status: string;
};

// What an edit action needs before writing anything: the establecimiento to
// authorize against (an animal's own direct fields — sex/breed/etc. — carry
// no establecimiento of their own) plus the current category and status, so
// a category change can be turned into a trustworthy recategorize event
// instead of taking the client's word for the "old" side of the change.
export async function getAnimalEditState(animalId: string): Promise<AnimalEditState | null> {
  const result = await db.execute<AnimalEditStateRow>(
    sql`select current_establishment_id, current_category_id, status from animal_current_state where animal_id = ${animalId}`
  );
  const row = result.rows[0];
  if (!row) return null;
  return { establishmentId: row.current_establishment_id, categoryId: row.current_category_id, status: row.status };
}

export type AnimalDetailsPatch = {
  sex: "male" | "female" | null;
  breed: string | null;
  birthDate: string | null;
  ownerId: string | null;
  secondaryTag: string | null;
  reproductiveStatusId: string | null;
};

// Direct corrections to fields that live on `animal`/`animal_tag_history`
// themselves, not derived from the event log — sex, breed, birth date,
// owner, and the current secondary tag. Anything event-sourced (tag,
// category, campo, potrero, estado) goes through its own activity instead,
// so it stays in the audit trail.
export async function updateAnimalDetails(animalId: string, patch: AnimalDetailsPatch): Promise<AnimalLookupDetail | null> {
  const { secondaryTag, ...animalPatch } = patch;
  await db.update(animal).set(animalPatch).where(eq(animal.id, animalId));

  const [currentTagRow] = await db
    .select({ id: animalTagHistory.id })
    .from(animalTagHistory)
    .where(eq(animalTagHistory.animalId, animalId))
    .orderBy(desc(animalTagHistory.validFrom))
    .limit(1);
  if (currentTagRow) {
    await db.update(animalTagHistory).set({ secondaryTag }).where(eq(animalTagHistory.id, currentTagRow.id));
  }

  const result = await db.execute<AnimalLookupDetailRow>(
    sql`${CURRENT_STATE_WITH_DETAILS_SELECT} where acs.animal_id = ${animalId}`
  );
  return result.rows[0] ? toAnimalLookupDetail(result.rows[0]) : null;
}
