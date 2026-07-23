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

  it("cannot read base tables or the materialized view directly (cross-farm leak fix)", async () => {
    if (!process.env.DATABASE_URL_REPORTING_TEST) {
      throw new Error("DATABASE_URL_REPORTING_TEST is not set — copy .env.local.example to .env.local");
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL_REPORTING_TEST });
    await client.connect();
    try {
      // Before the 0018 migration, reporting_ro held direct SELECT on every
      // base table (and animal_current_state) so it could CREATE the my_*
      // temp views — but that same grant let any query text read every
      // farm's rows directly, bypassing the farm-scoped my_* views entirely.
      // This is the exact exploit the reviewer confirmed; these must now
      // all reject with permission denied.
      await expect(client.query("SELECT * FROM farm")).rejects.toThrow(/permission denied/i);
      await expect(client.query("SELECT * FROM animal")).rejects.toThrow(/permission denied/i);
      await expect(client.query("SELECT * FROM event")).rejects.toThrow(/permission denied/i);
      await expect(client.query("SELECT * FROM animal_current_state")).rejects.toThrow(/permission denied/i);

      // The legitimate path — reading through the new named views used to
      // build the farm-scoped my_* temp views — must still work.
      await expect(client.query("SELECT * FROM farm_named LIMIT 1")).resolves.toBeDefined();
    } finally {
      await client.end();
    }
  });
});
