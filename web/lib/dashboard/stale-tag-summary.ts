import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

export type StaleTagRow = {
  animalId: string;
  currentTag: string | null;
  farmName: string | null;
  paddockName: string | null;
  lastEventType: string | null;
  lastEventDate: string;
  daysSinceLastEvent: number;
};

type StaleTagDbRow = {
  animal_id: string;
  current_tag: string | null;
  farm_name: string | null;
  paddock_name: string | null;
  last_event_type: string | null;
  last_event_date: string;
  days_since_last_event: number;
};

function toStaleTagRow(row: StaleTagDbRow): StaleTagRow {
  return {
    animalId: row.animal_id,
    currentTag: row.current_tag,
    farmName: row.farm_name,
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
 * `lastEventDate` falls back to the animal's `created_at` when it has no
 * events at all yet.
 */
export async function findStaleTags(
  userId: string,
  role: string | undefined,
  thresholdDays: number
): Promise<StaleTagRow[]> {
  const farmScope = isAdmin(role)
    ? sql.empty()
    : sql`and acs.current_farm_id in (${sql.join((await userFarmIds(userId)).map((id) => sql`${id}`), sql`, `)})`;

  const result = await db.execute<StaleTagDbRow>(sql`
    with candidate as (
      select
        acs.animal_id,
        acs.current_tag,
        f.name as farm_name,
        p.name as paddock_name,
        le.event_type as last_event_type,
        coalesce(le.event_date, a.created_at::date) as last_event_date
      from animal_current_state acs
      join animal a on a.id = acs.animal_id
      left join farm f on f.id = acs.current_farm_id
      left join paddock p on p.id = acs.current_paddock_id
      left join lateral (
        select e.event_type, e.event_date
        from event e
        where e.animal_id = acs.animal_id and e.event_type <> 'void'
        order by e.event_date desc, e.created_at desc
        limit 1
      ) le on true
      where acs.status = 'alive'
        ${farmScope}
    )
    select
      animal_id,
      current_tag,
      farm_name,
      paddock_name,
      last_event_type,
      last_event_date,
      (current_date - last_event_date) as days_since_last_event
    from candidate
    where (current_date - last_event_date) >= ${thresholdDays}
    order by days_since_last_event desc
    limit ${RESULT_LIMIT}
  `);

  return result.rows.map(toStaleTagRow);
}
