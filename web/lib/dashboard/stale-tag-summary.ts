import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, userEstablishmentIds } from "@/lib/dal/farm-access";

export type StaleTagRow = {
  animalId: string;
  currentTag: string | null;
  establishmentName: string | null;
  paddockName: string | null;
  lastEventType: string | null;
  lastEventDate: string;
  daysSinceLastEvent: number;
};

type StaleTagDbRow = {
  animal_id: string;
  current_tag: string | null;
  establishment_name: string | null;
  paddock_name: string | null;
  last_event_type: string | null;
  last_event_date: string;
  days_since_last_event: number;
};

function toStaleTagRow(row: StaleTagDbRow): StaleTagRow {
  return {
    animalId: row.animal_id,
    currentTag: row.current_tag,
    establishmentName: row.establishment_name,
    paddockName: row.paddock_name,
    lastEventType: row.last_event_type,
    lastEventDate: row.last_event_date,
    daysSinceLastEvent: row.days_since_last_event,
  };
}

const RESULT_LIMIT = 10;

/**
 * Alive animals with no non-void event in at least `thresholdDays` — a
 * candidate for an unreported death (or any other event nobody logged).
 * `lastEventDate` falls back to the earliest `valid_from` in the animal's
 * `animal_tag_history` when it has no events at all yet — that row is
 * written in the same transaction as the animal itself (see
 * `createNewAnimal`), so it's the earliest system timestamp we have for it.
 *
 * Also excludes animals whose `animal_tag_history` row is itself younger
 * than `thresholdDays` — a caravana entered into the system recently but
 * whose only event carries an old, backdated `event_date` (e.g. historical
 * import data) isn't an unreported death, it's just new to us.
 */
export async function findStaleTags(
  userId: string,
  role: string | undefined,
  thresholdDays: number
): Promise<StaleTagRow[]> {
  const establishmentScope = isAdmin(role)
    ? sql.empty()
    : sql`and acs.current_establishment_id in (${sql.join((await userEstablishmentIds(userId)).map((id) => sql`${id}`), sql`, `)})`;

  const result = await db.execute<StaleTagDbRow>(sql`
    with candidate as (
      select
        acs.animal_id,
        cur_tag.tag as current_tag,
        est.name as establishment_name,
        p.name as paddock_name,
        le.event_type as last_event_type,
        coalesce(le.event_date, earliest_tag.valid_from::date) as last_event_date,
        earliest_tag.valid_from::date as created_date
      from animal_current_state acs
      left join establishment est on est.id = acs.current_establishment_id
      left join paddock p on p.id = acs.current_paddock_id
      left join lateral (
        select ath.tag
        from animal_tag_history ath
        where ath.animal_id = acs.animal_id
        order by ath.valid_from desc
        limit 1
      ) cur_tag on true
      left join lateral (
        select ath.valid_from
        from animal_tag_history ath
        where ath.animal_id = acs.animal_id
        order by ath.valid_from asc
        limit 1
      ) earliest_tag on true
      left join lateral (
        select e.event_type, e.event_date
        from event e
        where e.animal_id = acs.animal_id
          and e.event_type <> 'void'
          and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id)
        order by e.event_date desc, e.created_at desc
        limit 1
      ) le on true
      where acs.status = 'alive'
        ${establishmentScope}
    )
    select
      animal_id,
      current_tag,
      establishment_name,
      paddock_name,
      last_event_type,
      last_event_date,
      (current_date - last_event_date) as days_since_last_event
    from candidate
    where (current_date - last_event_date) >= ${thresholdDays}
      and (current_date - created_date) >= ${thresholdDays}
    order by days_since_last_event desc
    limit ${RESULT_LIMIT}
  `);

  return result.rows.map(toStaleTagRow);
}
