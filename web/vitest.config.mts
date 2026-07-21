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
    server: {
      deps: {
        // Force next-auth through Vite's transform pipeline (instead of
        // being externalized to a bare `require`/`import`) so the
        // "next/server" alias below actually applies to it.
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // next-auth imports "next/server" without a file extension. Next.js
      // itself has no "exports" map for that subpath, so under Node/Vite's
      // strict ESM resolution (unlike Next's own webpack/Turbopack build,
      // which tolerates it) the bare specifier fails to resolve. Point it
      // straight at the real file so components that pull in next-auth
      // (e.g. via the logout Server Action) can be unit-tested.
      "next/server": path.resolve(__dirname, "./node_modules/next/server.js"),
    },
  },
});
