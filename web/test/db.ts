import { createDbClient } from "@/db/client";

if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST is not set — copy .env.local.example to .env.local");
}

export const testDb = createDbClient(process.env.DATABASE_URL_TEST);
