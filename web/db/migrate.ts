import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDbClient } from "./client";
import { loadEnv } from "./env";

// Deviation from the brief: dotenv loading was added since tsx does not read
// .env.local into process.env automatically (unlike `next dev`/`next build`).
loadEnv();

async function run() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const argConnectionString = positional[0];
  const connectionString =
    argConnectionString && argConnectionString.length > 0
      ? argConnectionString
      : process.argv.includes("--target=test")
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
