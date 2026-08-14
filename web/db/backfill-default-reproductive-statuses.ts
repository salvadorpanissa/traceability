import { config } from "dotenv";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";

// ENV_FILE picks which env file to load (.env.local for local dev by
// default, .env.production for prod) — same mechanism as db/migrate.ts.
config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE ?? ".env.local"), quiet: true });

const DEFAULT_STATUS_NAMES = ["Preñada", "Vacía"];

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const apply = process.argv.includes("--apply");

  const db = createDbClient(databaseUrl);

  const farms = await db.execute<{ id: string; name: string }>(sql`select id, name from farm`);

  console.log(`${apply ? "Applying" : "Would apply (dry run — pass --apply to write)"}:`);
  console.log(`${farms.rows.length} farm(s), ${DEFAULT_STATUS_NAMES.length} status(es) each.`);

  if (!apply) {
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const farmRow of farms.rows) {
      for (const name of DEFAULT_STATUS_NAMES) {
        await tx.execute(
          sql`insert into reproductive_status (farm_id, name) values (${farmRow.id}, ${name}) on conflict (farm_id, name) do nothing`
        );
      }
    }
  });
  console.log(`Seeded default reproductive statuses for ${farms.rows.length} farm(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
