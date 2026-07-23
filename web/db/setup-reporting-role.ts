import { config } from "dotenv";
import path from "node:path";
import { Client } from "pg";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

async function run() {
  const adminConnectionString = process.env.DATABASE_URL;
  const password = process.env.REPORTING_DB_PASSWORD;
  if (!adminConnectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!password) {
    throw new Error("REPORTING_DB_PASSWORD is not set");
  }

  const client = new Client({ connectionString: adminConnectionString });
  await client.connect();
  const escapedPassword = password.replace(/'/g, "''");
  await client.query(`ALTER ROLE reporting_ro WITH PASSWORD '${escapedPassword}'`);
  await client.end();
  console.log("reporting_ro password updated");
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
