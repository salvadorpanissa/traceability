import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, userEstablishmentIds } from "@/lib/dal/farm-access";

export type HealthEventRow = {
  eventId: string;
  eventDate: string;
  animalTag: string | null;
  establishmentId: string;
  establishmentName: string;
  paddockId: string | null;
  paddockName: string | null;
  productName: string;
};

type HealthEventDbRow = {
  event_id: string;
  event_date: string;
  animal_tag: string | null;
  establishment_id: string;
  establishment_name: string;
  paddock_id: string | null;
  paddock_name: string | null;
  product_name: string;
};

function toHealthEventRow(row: HealthEventDbRow): HealthEventRow {
  return {
    eventId: row.event_id,
    eventDate: row.event_date,
    animalTag: row.animal_tag,
    establishmentId: row.establishment_id,
    establishmentName: row.establishment_name,
    paddockId: row.paddock_id,
    paddockName: row.paddock_name,
    productName: row.product_name,
  };
}

const HEALTH_EVENTS_SELECT = sql`
  select
    e.id as event_id,
    e.event_date,
    acs.current_tag as animal_tag,
    e.establishment_id,
    est.name as establishment_name,
    eh.paddock_id,
    p.name as paddock_name,
    pr.name as product_name
  from event e
  join event_health eh on eh.event_id = e.id
  join establishment est on est.id = e.establishment_id
  join product pr on pr.id = eh.product_id
  left join paddock p on p.id = eh.paddock_id
  left join animal_current_state acs on acs.animal_id = e.animal_id
`;

// Health events attributed to the user's accessible establecimientos
// (e.establishment_id, the same dimension already used to scope who can
// confirm a health batch), since a given event's event_date.
export async function visibleHealthEventsSince(
  userId: string,
  role: string | undefined,
  sinceDate: string
): Promise<HealthEventRow[]> {
  if (isAdmin(role)) {
    const result = await db.execute<HealthEventDbRow>(
      sql`${HEALTH_EVENTS_SELECT} where e.event_type = 'health' and e.event_date >= ${sinceDate} order by e.event_date desc`
    );
    return result.rows.map(toHealthEventRow);
  }

  const establishmentIds = await userEstablishmentIds(userId);
  if (establishmentIds.length === 0) return [];

  const establishmentIdList = sql.join(
    establishmentIds.map((establishmentId) => sql`${establishmentId}`),
    sql`, `
  );
  const result = await db.execute<HealthEventDbRow>(
    sql`${HEALTH_EVENTS_SELECT} where e.event_type = 'health' and e.event_date >= ${sinceDate} and e.establishment_id in (${establishmentIdList}) order by e.event_date desc`
  );
  return result.rows.map(toHealthEventRow);
}
