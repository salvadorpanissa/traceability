import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Every spec shares one Postgres test DB (see web/test/reset-db.ts's
  // comment for the same issue in Vitest) and global-setup truncates it only
  // once for the whole run. Running spec files in parallel workers lets one
  // file's writes (a new column_mapping row, a newly created owner/paddock)
  // leak into another file's concurrently-running assertions, producing
  // non-deterministic failures. Force a single worker so files run serially.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
    },
  },
});
