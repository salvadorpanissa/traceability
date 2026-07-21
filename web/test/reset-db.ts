import { sql } from "drizzle-orm";
import { testDb } from "./db";

// NOTE: user_farm and user_account are added by later tasks (4, 6, 7, 10).
// Update this list to include them as their migrations land — TRUNCATE has no
// IF EXISTS clause in Postgres, so referencing a table before its migration
// exists fails the whole statement.
export async function resetTestDb() {
  await testDb.execute(
    sql`TRUNCATE TABLE farm, role RESTART IDENTITY CASCADE`
  );
}
