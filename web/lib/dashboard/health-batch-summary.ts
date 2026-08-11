import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation } from "@/db/schema";
import { isAdmin, userEstablishmentIds, requireEstablishmentAccess } from "@/lib/dal/farm-access";

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
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id)
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
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id)
      ${establishmentScope}
  `);

  return result.rows[0]?.cnt ?? 0;
}

export type HealthBatchProduct = {
  name: string;
  dose: string;
  doseUnit: string;
  route: string;
  withdrawalDays: number | null;
};

export type HealthBatchAnimal = {
  tag: string;
  eventDate: string;
  notes: string | null;
  withdrawalUntil: string | null;
};

export type HealthBatchDetail = {
  batchId: string;
  eventDate: string;
  establishmentName: string;
  paddockName: string | null;
  products: HealthBatchProduct[];
  animals: HealthBatchAnimal[];
};

type HealthBatchDetailDbRow = {
  event_date: string;
  establishment_name: string;
  paddock_name: string | null;
  product_name: string;
  dose: string;
  dose_unit: string;
  route: string;
  withdrawal_days: number | null;
  current_tag: string | null;
  notes: string | null;
};

// One row per (animal, product) pair in the batch — a batch can apply
// several products to the same set of animals (see confirmHealthBatch),
// so products and animal tags are each deduped independently below rather
// than assuming a 1:1 row-to-animal shape.
export async function healthBatchDetail(
  batchId: string,
  userId: string,
  role: string | undefined
): Promise<HealthBatchDetail | null> {
  const [batch] = await db.select().from(batchOperation).where(eq(batchOperation.id, batchId));
  if (!batch || batch.eventType !== "health") return null;
  await requireEstablishmentAccess(userId, role, batch.establishmentId);

  const result = await db.execute<HealthBatchDetailDbRow>(sql`
    select
      e.event_date,
      est.name as establishment_name,
      p.name as paddock_name,
      pr.name as product_name,
      eh.dose,
      eh.dose_unit,
      eh.route,
      eh.withdrawal_days,
      cur_tag.tag as current_tag,
      e.notes
    from event e
    join event_health eh on eh.event_id = e.id
    join establishment est on est.id = e.establishment_id
    join product pr on pr.id = eh.product_id
    left join paddock p on p.id = eh.paddock_id
    left join lateral (
      select ath.tag
      from animal_tag_history ath
      where ath.animal_id = e.animal_id
      order by ath.valid_from desc
      limit 1
    ) cur_tag on true
    where e.batch_operation_id = ${batchId}
      and e.event_type = 'health'
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id)
    order by cur_tag.tag
  `);

  if (result.rows.length === 0) return null;

  const [first] = result.rows;
  const products = new Map<string, HealthBatchProduct>();
  // An animal can carry several products in the same batch (e.g. two
  // vacunas applied together), each with its own withdrawal period — the
  // animal isn't clear until the longest of those has elapsed, so this
  // tracks the max withdrawalDays seen per animal rather than the last one.
  const animalAccumulators = new Map<string, { tag: string; eventDate: string; notes: string | null; maxWithdrawalDays: number | null }>();
  for (const row of result.rows) {
    const key = `${row.product_name}::${row.dose}::${row.dose_unit}::${row.route}::${row.withdrawal_days}`;
    if (!products.has(key)) {
      products.set(key, {
        name: row.product_name,
        dose: row.dose,
        doseUnit: row.dose_unit,
        route: row.route,
        withdrawalDays: row.withdrawal_days,
      });
    }
    if (!row.current_tag) continue;
    const existing = animalAccumulators.get(row.current_tag);
    if (!existing) {
      animalAccumulators.set(row.current_tag, {
        tag: row.current_tag,
        eventDate: row.event_date,
        notes: row.notes,
        maxWithdrawalDays: row.withdrawal_days,
      });
    } else if (existing.maxWithdrawalDays === null || (row.withdrawal_days ?? -1) > existing.maxWithdrawalDays) {
      existing.maxWithdrawalDays = row.withdrawal_days;
    }
  }

  const animals: HealthBatchAnimal[] = [...animalAccumulators.values()]
    .map((a) => ({
      tag: a.tag,
      eventDate: a.eventDate,
      notes: a.notes,
      withdrawalUntil: a.maxWithdrawalDays !== null ? addDays(a.eventDate, a.maxWithdrawalDays) : null,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  return {
    batchId,
    eventDate: first.event_date,
    establishmentName: first.establishment_name,
    paddockName: first.paddock_name,
    products: [...products.values()],
    animals,
  };
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
