import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import path from "node:path";

// Deviation from the brief: dotenv loading was added since drizzle-kit only
// auto-loads a plain `.env` file, not `.env.local` (this project's convention).
config({ path: path.resolve(__dirname, ".env.local"), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
