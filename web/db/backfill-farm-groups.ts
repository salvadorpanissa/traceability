import { config } from "dotenv";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";

// ENV_FILE picks which env file to load (.env.local for local dev by
// default, .env.production for prod) — same mechanism as db/migrate.ts.
config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE ?? ".env.local"), quiet: true });

// Fills farm.group_id, category.group_id, product.group_id after migration
// 0034 adds them nullable. Migration 0035 then tightens all three to NOT
// NULL — run this first, or 0035 will fail.
//
// 1. Every farm with no group yet joins one shared group (reusing an
//    existing group if any farm already has one, so this is safe to re-run).
// 2. Every category/product is assigned the group of the farm(s) that
//    actually used it (via event history). If a category/product was used
//    by farms in more than one group, it's duplicated — one copy per group,
//    with that group's own historical events repointed to its own copy —
//    since a single row can't belong to two groups at once. Unused rows
//    fall back to the sole existing group; if more than one group exists
//    with no usage to disambiguate, this script stops and asks for a manual
//    call instead of guessing.

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const apply = process.argv.includes("--apply");
  const db = createDbClient(databaseUrl);

  const log: string[] = [];

  await db.transaction(async (tx) => {
    // --- 1. Farms ---
    const existingGroup = await tx.execute<{ id: string }>(sql`
      select distinct f.group_id as id from farm f where f.group_id is not null
    `);
    let hubGroupId: string;
    if (existingGroup.rows.length > 1) {
      throw new Error(
        `Refusing to guess: ${existingGroup.rows.length} distinct groups already assigned to farms. Assign remaining farms manually.`
      );
    } else if (existingGroup.rows.length === 1) {
      hubGroupId = existingGroup.rows[0].id;
    } else {
      const [created] = await tx.execute<{ id: string }>(sql`
        insert into farm_group (name) values ('Campos') returning id
      `).then((r) => r.rows);
      hubGroupId = created.id;
      log.push(`Created farm_group "Campos" (${hubGroupId})`);
    }

    const ungroupedFarms = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from farm where group_id is null
    `);
    for (const f of ungroupedFarms.rows) {
      log.push(`farm "${f.name}" -> group ${hubGroupId}`);
    }
    if (ungroupedFarms.rows.length > 0) {
      await tx.execute(sql`update farm set group_id = ${hubGroupId} where group_id is null`);
    }

    const allGroups = await tx.execute<{ id: string }>(sql`select id from farm_group`);
    const singleGroupFallback = allGroups.rows.length === 1 ? allGroups.rows[0].id : null;

    // --- 2. Categories ---
    const categories = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from category where group_id is null
    `);
    for (const cat of categories.rows) {
      const usage = await tx.execute<{ group_id: string; n: string }>(sql`
        select f.group_id, count(*)::int as n
        from farm f
        where f.id in (
          select e.farm_id from event e join event_recategorize er on er.event_id = e.id
            where er.old_category_id = ${cat.id} or er.new_category_id = ${cat.id}
        )
        group by f.group_id
        order by n desc
      `);

      if (usage.rows.length === 0) {
        if (!singleGroupFallback) {
          throw new Error(
            `Category "${cat.name}" (${cat.id}) has no usage history and there is more than one farm_group — assign it manually.`
          );
        }
        log.push(`category "${cat.name}" -> group ${singleGroupFallback} (unused, sole group)`);
        await tx.execute(sql`update category set group_id = ${singleGroupFallback} where id = ${cat.id}`);
        continue;
      }

      const primaryGroupId = usage.rows[0].group_id;
      log.push(`category "${cat.name}" -> group ${primaryGroupId} (primary, ${usage.rows[0].n} events)`);
      await tx.execute(sql`update category set group_id = ${primaryGroupId} where id = ${cat.id}`);

      for (const minority of usage.rows.slice(1)) {
        const [dup] = await tx
          .execute<{ id: string }>(
            sql`
          insert into category (group_id, name, sex, min_age_months, active)
          select ${minority.group_id}, name, sex, min_age_months, active from category where id = ${cat.id}
          returning id
        `
          )
          .then((r) => r.rows);
        log.push(
          `  duplicated "${cat.name}" -> group ${minority.group_id} as ${dup.id} (${minority.n} events, repointing)`
        );
        await tx.execute(sql`
          update event_recategorize er set old_category_id = ${dup.id}
          from event e
          where er.event_id = e.id and er.old_category_id = ${cat.id} and e.farm_id in (
            select id from farm where group_id = ${minority.group_id}
          )
        `);
        await tx.execute(sql`
          update event_recategorize er set new_category_id = ${dup.id}
          from event e
          where er.event_id = e.id and er.new_category_id = ${cat.id} and e.farm_id in (
            select id from farm where group_id = ${minority.group_id}
          )
        `);
      }
    }

    // --- 3. Products ---
    const products = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from product where group_id is null
    `);
    for (const prod of products.rows) {
      const usage = await tx.execute<{ group_id: string; n: string }>(sql`
        select f.group_id, count(*)::int as n
        from farm f
        where f.id in (
          select e.farm_id from event e join event_health eh on eh.event_id = e.id
            where eh.product_id = ${prod.id}
        )
        group by f.group_id
        order by n desc
      `);

      if (usage.rows.length === 0) {
        if (!singleGroupFallback) {
          throw new Error(
            `Product "${prod.name}" (${prod.id}) has no usage history and there is more than one farm_group — assign it manually.`
          );
        }
        log.push(`product "${prod.name}" -> group ${singleGroupFallback} (unused, sole group)`);
        await tx.execute(sql`update product set group_id = ${singleGroupFallback} where id = ${prod.id}`);
        continue;
      }

      const primaryGroupId = usage.rows[0].group_id;
      log.push(`product "${prod.name}" -> group ${primaryGroupId} (primary, ${usage.rows[0].n} events)`);
      await tx.execute(sql`update product set group_id = ${primaryGroupId} where id = ${prod.id}`);

      for (const minority of usage.rows.slice(1)) {
        const [dup] = await tx
          .execute<{ id: string }>(
            sql`
          insert into product (group_id, name, default_dose, default_dose_unit, default_route, default_withdrawal_days)
          select ${minority.group_id}, name, default_dose, default_dose_unit, default_route, default_withdrawal_days
          from product where id = ${prod.id}
          returning id
        `
          )
          .then((r) => r.rows);
        log.push(
          `  duplicated "${prod.name}" -> group ${minority.group_id} as ${dup.id} (${minority.n} events, repointing)`
        );
        await tx.execute(sql`
          update event_health eh set product_id = ${dup.id}
          from event e
          where eh.event_id = e.id and eh.product_id = ${prod.id} and e.farm_id in (
            select id from farm where group_id = ${minority.group_id}
          )
        `);
      }
    }

    console.log(log.join("\n"));
    console.log(`\n${apply ? "Applied." : "Dry run — pass --apply to write."}`);

    if (!apply) {
      throw new Error("DRY_RUN_ROLLBACK");
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === "DRY_RUN_ROLLBACK") return;
    throw error;
  });

  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
