import { config } from "dotenv";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDbClient } from "./client";

// Deviation from the brief: dotenv loading was added since tsx does not read
// .env.local into process.env automatically (unlike `next dev`/`next build`).
config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

async function run() {
  // Deviation from the brief: the "db:migrate:test" npm script originally
  // passed "$DATABASE_URL_TEST" directly, but that shell substitution happens
  // before this file's dotenv.config() runs, so it silently resolved to an
  // empty string unless the caller's shell already exported the var. Using a
  // MIGRATE_TARGET flag (set literally by the npm script, not shell-expanded)
  // lets dotenv populate process.env first.
  const argConnectionString = process.argv[2];
  const connectionString =
    argConnectionString && argConnectionString.length > 0
      ? argConnectionString
      : process.env.MIGRATE_TARGET === "test"
        ? process.env.DATABASE_URL_TEST
        : process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Provide a connection string argument or set DATABASE_URL");
  }
  const db = createDbClient(connectionString);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied to", connectionString.replace(/:[^:@]+@/, ":***@"));
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
