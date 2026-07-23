import { describe, expect, it } from "vitest";
import { Client } from "pg";

describe("reporting_ro role", () => {
  it("can select from the reporting views but cannot write", async () => {
    if (!process.env.DATABASE_URL_REPORTING_TEST) {
      throw new Error("DATABASE_URL_REPORTING_TEST is not set — copy .env.local.example to .env.local");
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL_REPORTING_TEST });
    await client.connect();
    try {
      await expect(client.query("SELECT * FROM animal_current_state_named LIMIT 1")).resolves.toBeDefined();
      await expect(client.query("SELECT * FROM health_events_named LIMIT 1")).resolves.toBeDefined();
      await expect(client.query("INSERT INTO farm (name) VALUES ('Should Fail')")).rejects.toThrow(
        /permission denied/i
      );
    } finally {
      await client.end();
    }
  });
});
