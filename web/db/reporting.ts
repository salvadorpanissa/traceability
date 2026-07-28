import { Pool } from "pg";

if (!process.env.DATABASE_URL_REPORTING) {
  throw new Error("DATABASE_URL_REPORTING is not set");
}

// See db/client.ts for why this is bounded instead of left to pg's defaults.
export const reportingPool = new Pool({
  connectionString: process.env.DATABASE_URL_REPORTING,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
