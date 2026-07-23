import { Pool } from "pg";

if (!process.env.DATABASE_URL_REPORTING_TEST) {
  throw new Error("DATABASE_URL_REPORTING_TEST is not set — copy .env.local.example to .env.local");
}

export const testReportingPool = new Pool({ connectionString: process.env.DATABASE_URL_REPORTING_TEST });
