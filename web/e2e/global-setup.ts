import { execSync } from "node:child_process";
import { Client } from "pg";

// Deviation from the brief: traceability_test is also used by the Vitest
// integration suite (web/test/db.ts + web/test/reset-db.ts), which truncates
// tables in beforeEach but never after the run finishes. If `npm test` runs
// before `npm run test:e2e`, leftover rows (e.g. a second farm inserted by
// __tests__/dal/farm-access.test.ts) survive into this "fresh" E2E run and
// break the single-farm auto-skip assertions non-deterministically. Truncate
// the app tables here — in the same FK-safe order as test/reset-db.ts —
// before seeding, so "seeded fresh" is guaranteed regardless of what ran
// against this database before.
async function truncateTestDb(testUrl: string) {
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query("TRUNCATE TABLE user_farm CASCADE");
    await client.query("TRUNCATE TABLE user_account RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE farm RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE role RESTART IDENTITY CASCADE");
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set");
  }
  await truncateTestDb(testUrl);
  execSync(`DATABASE_URL="${testUrl}" npm run db:seed`, {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
      SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "changeme123",
    },
  });
}
