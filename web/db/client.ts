import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Bounded so a single long-running server process can't open unbounded
// connections against Neon (whose connection limit is shared across every
// deployment target hitting the same database). This runs on Vercel
// functions, which don't reuse a pool across cold starts — every concurrent
// invocation opens its own pool, so `max` here is a per-invocation cap, not
// a global one. Keep it small and point DATABASE_URL at Neon's pooled
// (PgBouncer, "-pooler") endpoint so many small pools stack instead of
// exhausting Neon's direct-connection limit.
export function createDbClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle connection dropped by Neon (or the pooler) otherwise surfaces as
  // an unhandled 'error' event and crashes the whole function invocation
  // instead of just failing the query that was using it.
  pool.on("error", (err) => {
    console.error("Postgres pool error", err);
  });
  return drizzle(pool, { schema });
}
