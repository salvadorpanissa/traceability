import { config } from "dotenv";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { deduceAgeMonthsForCategory } from "../lib/activities/category-birth-date";
import { estimateBirthDateFromAge } from "../lib/activities/date-normalization";

// ENV_FILE picks which env file to load (.env.local for local dev by
// default, .env.production for prod) — same mechanism as db/migrate.ts.
config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE ?? ".env.local"), quiet: true });

type CandidateRow = {
  animal_id: string;
  current_tag: string | null;
  category_id: string;
  category_name: string;
  anchor_date: string;
  initial_category_id: string;
};

// Only animals whose CURRENT category still matches the category from their
// earliest (non-voided) recategorize event are touched — if it's since
// changed (a later manual/auto_age recategorize), the earliest event's
// category no longer describes this animal, so guessing an age from it
// would be wrong; those are left for a human to fill in manually instead.
const CANDIDATES_SELECT = sql`
  select
    a.id as animal_id,
    acs.current_tag,
    acs.current_category_id as category_id,
    c.name as category_name,
    first_evt.event_date as anchor_date,
    first_evt.new_category_id as initial_category_id
  from animal a
  join animal_current_state acs on acs.animal_id = a.id
  join category c on c.id = acs.current_category_id
  join lateral (
    select er.new_category_id, e.event_date
    from event e
    join event_recategorize er on er.event_id = e.id
    where e.animal_id = a.id
      and e.event_type = 'recategorize'
      and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id)
    order by e.event_date asc, e.created_at asc
    limit 1
  ) first_evt on true
  where a.birth_date is null
    and acs.current_category_id is not null
`;

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const apply = process.argv.includes("--apply");

  const db = createDbClient(databaseUrl);

  const categories = await db.execute<{ id: string; min_age_months: number | null }>(
    sql`select id, min_age_months from category`
  );
  const categoryBrackets = categories.rows.map((c) => ({ id: c.id, minAgeMonths: c.min_age_months }));

  const candidates = await db.execute<CandidateRow>(CANDIDATES_SELECT);

  const updates: { animalId: string; tag: string | null; categoryName: string; birthDate: string }[] = [];
  let skippedRecategorized = 0;
  let skippedNoAgeInfo = 0;

  for (const row of candidates.rows) {
    if (row.initial_category_id !== row.category_id) {
      skippedRecategorized += 1;
      continue;
    }
    const ageMonths = deduceAgeMonthsForCategory(row.category_id, categoryBrackets);
    if (ageMonths === null) {
      skippedNoAgeInfo += 1;
      continue;
    }
    updates.push({
      animalId: row.animal_id,
      tag: row.current_tag,
      categoryName: row.category_name,
      birthDate: estimateBirthDateFromAge(row.anchor_date, ageMonths),
    });
  }

  const byCategory = new Map<string, number>();
  for (const u of updates) byCategory.set(u.categoryName, (byCategory.get(u.categoryName) ?? 0) + 1);

  console.log(`${apply ? "Applying" : "Would apply (dry run — pass --apply to write)"}:`);
  for (const [name, count] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }
  console.log(`Total: ${updates.length}`);
  console.log(`Skipped (category changed since first assignment): ${skippedRecategorized}`);
  console.log(`Skipped (category has no age bracket to deduce from): ${skippedNoAgeInfo}`);

  if (!apply) {
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx.execute(sql`update animal set birth_date = ${u.birthDate} where id = ${u.animalId}`);
    }
  });
  console.log(`Updated ${updates.length} animal(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
