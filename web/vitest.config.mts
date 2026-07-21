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
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
});
