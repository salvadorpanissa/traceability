import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Bounded so a single long-running server process can't open unbounded
// connections against Neon (whose connection limit is shared across every
// deployment target hitting the same database). If this ever runs on a
// serverless platform (e.g. Vercel functions, which don't reuse a pool
// across cold starts), point DATABASE_URL at Neon's pooled (PgBouncer)
// endpoint instead of raising these limits.
export function createDbClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return drizzle(pool, { schema });
}
