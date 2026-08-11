import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, userEstablishmentIds } from "@/lib/dal/farm-access";

export type HealthBatchRow = {
  batchId: string;
  eventDate: string;
  establishmentName: string;
  paddockName: string | null;
  productName: string;
  animalCount: number;
};

type HealthBatchDbRow = {
  batch_id: string;
  event_date: string;
  establishment_name: string;
  paddock_name: string | null;
  product_name: string;
  animal_count: number;
};

function toHealthBatchRow(row: HealthBatchDbRow): HealthBatchRow {
  return {
    batchId: row.batch_id,
    eventDate: row.event_date,
    establishmentName: row.establishment_name,
    paddockName: row.paddock_name,
    productName: row.product_name,
    animalCount: row.animal_count,
  };
}

/**
 * Returns distinct health batch operations since a given date, with one row
 * per batch carrying its associated establecimiento, paddock, product, and
 * animal count.
 */
export async function visibleHealthBatchesSince(
  userId: string,
  role: string | undefined,
  sinceDate: string
): Promise<HealthBatchRow[]> {
  const establishmentScope = isAdmin(role)
    ? sql.empty()
    : sql`and e.establishment_id in (${sql.join((await userEstablishmentIds(userId)).map((id) => sql`${id}`), sql`, `)})`;

  const result = await db.execute<HealthBatchDbRow>(sql`
    select distinct on (bo.id)
      bo.id                                        as batch_id,
      e.event_date,
      est.name                                     as establishment_name,
      p.name                                       as paddock_name,
      pr.name                                      as product_name,
      bo.animal_count
    from batch_operation bo
    join event e on e.batch_operation_id = bo.id and e.establishment_id = bo.establishment_id
    join establishment est on est.id = e.establishment_id
    join event_health eh on eh.event_id = e.id
    join product pr on pr.id = eh.product_id
    left join paddock p on p.id = eh.paddock_id
    where bo.event_type = 'health'
      and e.event_date >= ${sinceDate}
      ${establishmentScope}
    order by bo.id, e.event_date desc
  `);

  return result.rows.map(toHealthBatchRow);
}

/**
 * Counts distinct animals that had at least one health event since the given
 * date — no double-counting when the same animal was treated multiple times
 * or in multiple batches.
 */
export async function countDistinctAnimalsTreatedSince(
  userId: string,
  role: string | undefined,
  sinceDate: string
): Promise<number> {
  const establishmentScope = isAdmin(role)
    ? sql.empty()
    : sql`and e.establishment_id in (${sql.join((await userEstablishmentIds(userId)).map((id) => sql`${id}`), sql`, `)})`;

  const result = await db.execute<{ cnt: number }>(sql`
    select count(distinct e.animal_id) as cnt
    from event e
    where e.event_type = 'health'
      and e.event_date >= ${sinceDate}
      ${establishmentScope}
  `);

  return result.rows[0]?.cnt ?? 0;
}
