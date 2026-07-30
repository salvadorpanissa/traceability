import { config } from "dotenv";
import path from "node:path";
import { Client } from "pg";

// ENV_FILE picks which env file to load (.env.local for local dev by
// default, .env.production for prod) — same mechanism as db/migrate.ts.
config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE ?? ".env.local"), quiet: true });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // This deletes every row in every table — an explicit, separate opt-in on
  // top of picking the right ENV_FILE, so a bare `npm run db:wipe:prod` typo
  // can't silently take out a real database.
  if (process.env.WIPE_CONFIRM !== "yes") {
    throw new Error("Refusing to wipe: set WIPE_CONFIRM=yes explicitly to confirm you mean it");
  }

  const client = new Client({ connectionString });
  await client.connect();

  // Discovered from pg_tables instead of a hardcoded list, so this never
  // drifts out of sync with schema changes.
  const { rows } = await client.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`
  );

  if (rows.length === 0) {
    console.log("No tables found; nothing to wipe.");
    await client.end();
    process.exit(0);
  }

  const tableList = rows.map((r) => `"${r.tablename}"`).join(", ");
  await client.query(`truncate table ${tableList} cascade`);

  // Materialized views (e.g. animal_current_state) live in pg_matviews, not
  // pg_tables — TRUNCATE never touches them, so without this they'd keep
  // showing stale pre-wipe rows until some later event write happens to
  // trigger a refresh.
  const { rows: matviews } = await client.query<{ matviewname: string }>(
    `select matviewname from pg_matviews where schemaname = 'public'`
  );
  for (const { matviewname } of matviews) {
    await client.query(`refresh materialized view "${matviewname}"`);
  }

  await client.end();
  console.log(
    `Wiped ${rows.length} tables and refreshed ${matviews.length} materialized views on`,
    connectionString.replace(/:[^:@]+@/, ":***@")
  );
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
