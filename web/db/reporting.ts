import { Pool } from "pg";

if (!process.env.DATABASE_URL_REPORTING) {
  throw new Error("DATABASE_URL_REPORTING is not set");
}

export const reportingPool = new Pool({ connectionString: process.env.DATABASE_URL_REPORTING });
