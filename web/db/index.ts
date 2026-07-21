import { createDbClient } from "./client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const db = createDbClient(process.env.DATABASE_URL);
