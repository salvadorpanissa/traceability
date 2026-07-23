import { describe, expect, it } from "vitest";
import { Client } from "pg";

// The 14 base tables/matview that migration 0018 revokes direct SELECT on
// for reporting_ro. Copied from 0018_reporting_ro_no_base_table_access.sql's
// REVOKE statement — keep in sync if that list ever changes.
const REVOKED_BASE_OBJECTS = [
  "animal",
  "farm",
  "paddock",
  "category",
  "product",
  "owner",
  "event",
  "event_transfer",
  "event_health",
  "event_retag",
  "event_recategorize",
  "event_sale",
  "event_death",
  "animal_current_state",
];

// The 12 named views reporting_ro legitimately reads through, now relocated
// by migration 0019 into the dedicated `reporting_named` schema (never on
// reporting_ro's search_path — see
// drizzle/0019_isolate_reporting_named_views.sql).
const NAMED_VIEWS = [
  "animal_current_state_named",
  "transfer_events_named",
  "health_events_named",
  "retag_events_named",
  "recategorize_events_named",
  "sale_events_named",
  "death_events_named",
  "farm_named",
  "paddock_named",
  "category_named",
  "product_named",
  "owner_named",
];

function requireReportingTestUrl(): string {
  if (!process.env.DATABASE_URL_REPORTING_TEST) {
    throw new Error("DATABASE_URL_REPORTING_TEST is not set — copy .env.local.example to .env.local");
  }
  return process.env.DATABASE_URL_REPORTING_TEST;
}

describe("reporting_ro role", () => {
  it("can select from the reporting views (schema-qualified) but cannot write", async () => {
    const client = new Client({ connectionString: requireReportingTestUrl() });
    await client.connect();
    try {
      await expect(
        client.query("SELECT * FROM reporting_named.animal_current_state_named LIMIT 1")
      ).resolves.toBeDefined();
      await expect(client.query("SELECT * FROM reporting_named.health_events_named LIMIT 1")).resolves.toBeDefined();
      await expect(client.query("INSERT INTO farm (name) VALUES ('Should Fail')")).rejects.toThrow(
        /permission denied/i
      );
    } finally {
      await client.end();
    }
  });

  it("cannot read any base table or the materialized view directly (cross-farm leak fix)", async () => {
    // Before the 0018 migration, reporting_ro held direct SELECT on every
    // base table (and animal_current_state) so it could CREATE the my_*
    // temp views — but that same grant let any query text read every
    // farm's rows directly, bypassing the farm-scoped my_* views entirely.
    // This is the exact exploit the reviewer confirmed; all 14 objects must
    // now reject with permission denied.
    const client = new Client({ connectionString: requireReportingTestUrl() });
    await client.connect();
    try {
      for (const object of REVOKED_BASE_OBJECTS) {
        await expect(
          client.query(`SELECT * FROM ${object} LIMIT 1`),
          `expected SELECT on "${object}" to be denied`
        ).rejects.toThrow(/permission denied/i);
      }
    } finally {
      await client.end();
    }
  });

  it("can read all 12 named views through the reporting_named schema (legitimate path)", async () => {
    // The legitimate path — reading through the named views used to build
    // the farm-scoped my_* temp views — must still work when schema-qualified.
    const client = new Client({ connectionString: requireReportingTestUrl() });
    await client.connect();
    try {
      for (const view of NAMED_VIEWS) {
        await expect(
          client.query(`SELECT * FROM reporting_named.${view} LIMIT 1`),
          `expected SELECT on "reporting_named.${view}" to succeed`
        ).resolves.toBeDefined();
      }
    } finally {
      await client.end();
    }
  });

  it("cannot resolve the named views unqualified (0019 schema isolation)", async () => {
    // This is the actual security property migration 0019 hardens: the 12
    // named views moved out of `public` into `reporting_named`, a schema
    // that is never added to reporting_ro's search_path. An LLM-generated
    // query referencing e.g. `farm_named` unqualified must now fail to
    // resolve at all — not just be blocked by the SQL validator's
    // whitelist, but be genuinely unreachable at the database level.
    const client = new Client({ connectionString: requireReportingTestUrl() });
    await client.connect();
    try {
      for (const view of NAMED_VIEWS) {
        await expect(
          client.query(`SELECT * FROM ${view} LIMIT 1`),
          `expected unqualified "${view}" to fail to resolve`
        ).rejects.toThrow(/does not exist/i);
      }
    } finally {
      await client.end();
    }
  });
});
