import { sql } from "drizzle-orm";
import { db } from "@/db";

export type PendingWithdrawal = { animalId: string; productName: string; restrictionEndDate: string };

type PendingWithdrawalRow = { animal_id: string; product_name: string; restriction_end_date: string };

export async function findPendingWithdrawals(animalIds: string[], asOfDate: string): Promise<PendingWithdrawal[]> {
  if (animalIds.length === 0) return [];

  const animalIdList = sql.join(
    animalIds.map((animalId) => sql`${animalId}`),
    sql`, `
  );

  const result = await db.execute<PendingWithdrawalRow>(sql`
    select
      e.animal_id,
      p.name as product_name,
      (e.event_date + eh.withdrawal_days) as restriction_end_date
    from event e
    join event_health eh on eh.event_id = e.id
    join product p on p.id = eh.product_id
    where e.animal_id in (${animalIdList})
      and e.event_type = 'health'
      and eh.withdrawal_days is not null
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id)
      and (e.event_date + eh.withdrawal_days) >= ${asOfDate}::date
  `);

  return result.rows.map((row) => ({
    animalId: row.animal_id,
    productName: row.product_name,
    restrictionEndDate: row.restriction_end_date,
  }));
}
