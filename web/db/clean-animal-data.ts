import { config } from "dotenv";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

// Tables truncated directly; CASCADE also clears their dependents:
// animal -> animal_tag_history
// event -> event_transfer, event_health, event_retag, event_recategorize, event_sale, event_death
// dicose_registration -> own_tag
// batch_operation, sale_settlement have no dependents of their own.
// Untouched: paddock, category, user_account, user_farm, role, farm, owner, product, column_mapping.
const TABLES_TO_TRUNCATE = ["animal", "event", "batch_operation", "sale_settlement", "dicose_registration"];

// Truncates real data with no undo. Requires the operator to pass
// --confirm=<db-host> (read off the connection string this run resolves to)
// so running it against a stale/production .env.local by mistake fails
// instead of silently wiping data.
function requireConfirmedHost(databaseUrl: string): void {
  const host = new URL(databaseUrl).host;
  const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="));
  const confirmedHost = confirmArg?.slice("--confirm=".length);
  if (confirmedHost === host) return;

  console.error(`This will TRUNCATE ${TABLES_TO_TRUNCATE.join(", ")} (cascade) on database host: ${host}`);
  console.error(`Re-run with --confirm=${host} to proceed.`);
  process.exit(1);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  requireConfirmedHost(databaseUrl);

  const db = createDbClient(databaseUrl);

  console.log("Row counts before cleanup:");
  for (const table of TABLES_TO_TRUNCATE) {
    const result = await db.execute<{ count: string }>(sql.raw(`select count(*)::int as count from "${table}"`));
    console.log(`  ${table}: ${result.rows[0].count}`);
  }

  await db.execute(sql.raw(`truncate table ${TABLES_TO_TRUNCATE.map((t) => `"${t}"`).join(", ")} cascade`));

  console.log("\nRow counts after cleanup:");
  for (const table of TABLES_TO_TRUNCATE) {
    const result = await db.execute<{ count: string }>(sql.raw(`select count(*)::int as count from "${table}"`));
    console.log(`  ${table}: ${result.rows[0].count}`);
  }

  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
