import { execSync } from "node:child_process";

export default async function globalSetup() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set");
  }
  execSync(`DATABASE_URL="${testUrl}" npm run db:seed`, {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
      SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "changeme123",
    },
  });
}
