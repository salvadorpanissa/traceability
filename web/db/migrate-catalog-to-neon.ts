import { config } from "dotenv";
import path from "node:path";
import { Client } from "pg";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

const LOCAL_URL = "postgres://traceability:traceability_dev_password@localhost:5432/traceability";

// Parent tables before children: role/owner/category/product/farm have no
// FK dependencies among this set; user_account depends on role; paddock and
// user_farm depend on farm; user_farm also depends on user_account.
const TABLES_IN_ORDER = ["role", "owner", "category", "product", "farm", "user_account", "paddock", "user_farm"];

// Writes rows with no upsert (fails on duplicate PKs if re-run) into
// whatever DATABASE_URL resolves to. Requires the operator to pass
// --confirm=<db-host> so a stale/production .env.local doesn't get written
// to unintentionally.
function requireConfirmedHost(databaseUrl: string): void {
  const host = new URL(databaseUrl).host;
  const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="));
  const confirmedHost = confirmArg?.slice("--confirm=".length);
  if (confirmedHost === host) return;

  console.error(`This will INSERT rows from ${LOCAL_URL} into database host: ${host}`);
  console.error(`Re-run with --confirm=${host} to proceed.`);
  process.exit(1);
}

async function run() {
  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("DATABASE_URL is not set");
  requireConfirmedHost(targetUrl);

  const source = new Client({ connectionString: LOCAL_URL });
  const target = new Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();

  for (const table of TABLES_IN_ORDER) {
    const { rows } = await source.query(`select * from "${table}"`);
    if (rows.length === 0) {
      console.log(`${table}: 0 rows, skipping`);
      continue;
    }
    const columns = Object.keys(rows[0]);
    const columnList = columns.map((c) => `"${c}"`).join(", ");
    for (const row of rows) {
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const values = columns.map((c) => row[c]);
      await target.query(`insert into "${table}" (${columnList}) values (${placeholders})`, values);
    }
    console.log(`${table}: copied ${rows.length} row(s)`);
  }

  await source.end();
  await target.end();
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
