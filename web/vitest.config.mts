import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { config } from "dotenv";

// Load DATABASE_URL_TEST (and friends) from .env.local so `npm test` works
// without requiring the shell to export them manually. Deviation from the
// brief: dotenv loading was added here since Vitest does not read .env.local
// into process.env by default.
config({ path: path.resolve(__dirname, ".env.local"), quiet: true });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    // Integration tests share a single Postgres test DB (web/test/db.ts) and
    // each does a TRUNCATE ... CASCADE in beforeEach. Vitest's default file
    // parallelism runs test files concurrently in separate workers, so one
    // file's TRUNCATE can wipe rows another file just inserted, producing
    // non-deterministic failures. This is a small suite (single-digit test
    // files), so disabling file parallelism entirely is the simplest correct
    // fix rather than building partial-parallelism/test-isolation schemes.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
});
