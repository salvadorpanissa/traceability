# Consulta en lenguaje natural del dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type a question in Spanish on the dashboard, translate it to SQL with Gemini, and render the result as a dynamic table — without ever letting the generated SQL see data outside the user's farm scope.

**Architecture:** A Postgres migration adds a dedicated read-only role (`reporting_ro`) and seven persistent "named" views joining existing tables/materialized views with human-readable names. At request time, a Server Action opens a transaction on that role's connection, creates 12 farm-scoped `TEMP VIEW`s over those named views/catalogs, asks Gemini for a single `SELECT` against that schema, validates the SQL with `node-sql-parser`, executes it against the temp views, and returns dynamic `{columns, rows}` to a client component that renders a generic table.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM + `pg` (raw pool for the reporting role), `node-sql-parser` (SQL validation), `@google/genai` (Gemini Developer API), Vitest + Testing Library + Playwright.

## Global Constraints

- Farm scoping must be enforced by the data the LLM can see (temp views), never by trusting the generated SQL text — see `docs/superpowers/specs/2026-07-22-nl-query-dashboard-design.md`.
- The reporting role has `SELECT` only, no `INSERT`/`UPDATE`/`DELETE`/DDL, and a 5s `statement_timeout`.
- The LLM never sees real table names, `farm_id` columns, or any table outside the curated `my_*` schema.
- The generated SQL is never shown to the user; only the result table or a generic Spanish error message.
- No tables outside the curated set (users, roles, auth, column-mapping) are ever exposed, including to admins.
- All new UI copy goes through the existing i18n dictionary (`web/lib/i18n/dictionaries.ts`), both `es` and `en`.

---

### Task 1: Reporting role, named views migration, and connection pools

**Files:**
- Create: `web/drizzle/0014_reporting_role_and_views.sql`
- Modify: `web/drizzle/meta/_journal.json`
- Create: `web/db/reporting.ts`
- Create: `web/test/reporting-db.ts`
- Modify: `web/.env.local.example`
- Modify: `web/.env.local` (developer's local copy — not committed, see step 6)
- Modify: `web/package.json` (new script)
- Create: `web/db/setup-reporting-role.ts`
- Test: `web/__tests__/db/reporting-role.test.ts`

**Interfaces:**
- Produces: `reportingPool: pg.Pool` exported from `web/db/reporting.ts`, reading `DATABASE_URL_REPORTING`.
- Produces: `testReportingPool: pg.Pool` exported from `web/test/reporting-db.ts`, reading `DATABASE_URL_REPORTING_TEST`. Later tasks mock `@/db/reporting` to this pool in tests.
- Produces (DB objects): views `animal_current_state_named`, `transfer_events_named`, `health_events_named`, `retag_events_named`, `recategorize_events_named`, `sale_events_named`, `death_events_named`; role `reporting_ro`.

- [ ] **Step 1: Write the migration SQL**

Create `web/drizzle/0014_reporting_role_and_views.sql`:

```sql
-- Persistent read-only "named" views used for the natural-language reporting
-- feature (docs/superpowers/specs/2026-07-22-nl-query-dashboard-design.md).
-- These are always-current SQL views (not materialized) built on top of the
-- existing animal_current_state materialized view and event/event_* tables.
-- At request time, web/lib/dal/reporting/scoped-views.ts wraps each of these
-- in a farm-scoped TEMP VIEW (my_*) before handing the schema to the LLM.

create view animal_current_state_named as
select
  acs.animal_id,
  acs.current_tag,
  acs.current_farm_id,
  f.name as farm_name,
  acs.current_paddock_id,
  p.name as paddock_name,
  acs.current_category_id,
  c.name as category_name,
  a.owner_id,
  o.name as owner_name,
  acs.status
from animal_current_state acs
join animal a on a.id = acs.animal_id
left join farm f on f.id = acs.current_farm_id
left join paddock p on p.id = acs.current_paddock_id
left join category c on c.id = acs.current_category_id
left join owner o on o.id = a.owner_id;
--> statement-breakpoint

create view transfer_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  t.origin_farm_id,
  ofarm.name as origin_farm_name,
  t.destination_farm_id,
  dfarm.name as destination_farm_name,
  t.origin_paddock_id,
  opaddock.name as origin_paddock_name,
  t.destination_paddock_id,
  dpaddock.name as destination_paddock_name,
  t.guide_number,
  e.notes,
  e.created_at
from event e
join event_transfer t on t.event_id = e.id
join farm f on f.id = e.farm_id
left join farm ofarm on ofarm.id = t.origin_farm_id
left join farm dfarm on dfarm.id = t.destination_farm_id
left join paddock opaddock on opaddock.id = t.origin_paddock_id
left join paddock dpaddock on dpaddock.id = t.destination_paddock_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'transfer'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view health_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  h.product_id,
  pr.name as product_name,
  h.dose,
  h.dose_unit,
  h.route,
  h.withdrawal_days,
  h.notes as health_notes,
  e.notes,
  e.created_at
from event e
join event_health h on h.event_id = e.id
join farm f on f.id = e.farm_id
left join product pr on pr.id = h.product_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'health'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view retag_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  e.farm_id,
  f.name as farm_name,
  r.old_tag,
  r.new_tag,
  e.notes,
  e.created_at
from event e
join event_retag r on r.event_id = e.id
join farm f on f.id = e.farm_id
where e.event_type = 'retag'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view recategorize_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  r.old_category_id,
  oc.name as old_category_name,
  r.new_category_id,
  nc.name as new_category_name,
  e.notes,
  e.created_at
from event e
join event_recategorize r on r.event_id = e.id
join farm f on f.id = e.farm_id
left join category oc on oc.id = r.old_category_id
left join category nc on nc.id = r.new_category_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'recategorize'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view sale_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  s.buyer,
  s.price,
  s.weight_kg,
  e.notes,
  e.created_at
from event e
join event_sale s on s.event_id = e.id
join farm f on f.id = e.farm_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'sale'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view death_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  d.cause,
  e.notes,
  e.created_at
from event e
join event_death d on d.event_id = e.id
join farm f on f.id = e.farm_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'death'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

do $$
begin
  if not exists (select from pg_roles where rolname = 'reporting_ro') then
    create role reporting_ro with login;
  end if;
end
$$;
--> statement-breakpoint

grant usage on schema public to reporting_ro;
--> statement-breakpoint

grant select on
  animal,
  farm,
  paddock,
  category,
  product,
  owner,
  event,
  event_transfer,
  event_health,
  event_retag,
  event_recategorize,
  event_sale,
  event_death,
  animal_current_state,
  animal_current_state_named,
  transfer_events_named,
  health_events_named,
  retag_events_named,
  recategorize_events_named,
  sale_events_named,
  death_events_named
to reporting_ro;
--> statement-breakpoint

alter role reporting_ro set statement_timeout = '5s';
```

- [ ] **Step 2: Register the migration in the journal**

Open `web/drizzle/meta/_journal.json` and add an entry after the `0013_sharp_clea` one (keep the trailing entries array valid JSON — add a comma after the `0013` object):

```json
        {
            "idx": 14,
            "version": "7",
            "when": 1753189200000,
            "tag": "0014_reporting_role_and_views",
            "breakpoints": true
        }
```

- [ ] **Step 3: Add the reporting connection pools**

Create `web/db/reporting.ts`:

```ts
import { Pool } from "pg";

if (!process.env.DATABASE_URL_REPORTING) {
  throw new Error("DATABASE_URL_REPORTING is not set");
}

export const reportingPool = new Pool({ connectionString: process.env.DATABASE_URL_REPORTING });
```

Create `web/test/reporting-db.ts`:

```ts
import { Pool } from "pg";

if (!process.env.DATABASE_URL_REPORTING_TEST) {
  throw new Error("DATABASE_URL_REPORTING_TEST is not set — copy .env.local.example to .env.local");
}

export const testReportingPool = new Pool({ connectionString: process.env.DATABASE_URL_REPORTING_TEST });
```

- [ ] **Step 4: Add the password-provisioning script**

`ALTER ROLE ... PASSWORD` does not accept bind parameters, so the password is escaped manually here. This script only ever reads the password from the developer's own `.env.local`/deployment secret — never from user input — so manual quote-escaping is safe.

Create `web/db/setup-reporting-role.ts`:

```ts
import { config } from "dotenv";
import path from "node:path";
import { Client } from "pg";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

async function run() {
  const adminConnectionString = process.env.DATABASE_URL;
  const password = process.env.REPORTING_DB_PASSWORD;
  if (!adminConnectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!password) {
    throw new Error("REPORTING_DB_PASSWORD is not set");
  }

  const client = new Client({ connectionString: adminConnectionString });
  await client.connect();
  const escapedPassword = password.replace(/'/g, "''");
  await client.query(`ALTER ROLE reporting_ro WITH PASSWORD '${escapedPassword}'`);
  await client.end();
  console.log("reporting_ro password updated");
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add the script to `web/package.json`'s `"scripts"` (alongside `"db:seed"`):

```json
    "db:setup-reporting-role": "tsx db/setup-reporting-role.ts",
```

- [ ] **Step 5: Add the new env vars to the example file**

Append to `web/.env.local.example`:

```
DATABASE_URL_REPORTING=postgres://reporting_ro:reporting_dev_password@localhost:5432/traceability
DATABASE_URL_REPORTING_TEST=postgres://reporting_ro:reporting_dev_password@localhost:5432/traceability_test
REPORTING_DB_PASSWORD=reporting_dev_password
GEMINI_API_KEY=replace-with-your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

- [ ] **Step 6: Update your local `.env.local` and apply the migration**

Copy the same four lines from Step 5 into your own `web/.env.local` (not committed), using the same `reporting_dev_password` value (or generate your own — it only needs to match between this file and what you pass to the setup script).

Run, in order:

```bash
cd web
npm run db:migrate
npm run db:migrate:test
npm run db:setup-reporting-role
```

Expected: no errors; `db:setup-reporting-role` prints `reporting_ro password updated`.

- [ ] **Step 7: Write the failing test**

Create `web/__tests__/db/reporting-role.test.ts`:

```ts
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
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd web && npx vitest run __tests__/db/reporting-role.test.ts`
Expected: PASS (1 test). If it fails with a connection/password error, re-check Step 6 was run.

- [ ] **Step 9: Commit**

```bash
git add web/drizzle/0014_reporting_role_and_views.sql web/drizzle/meta/_journal.json \
  web/db/reporting.ts web/test/reporting-db.ts web/db/setup-reporting-role.ts \
  web/.env.local.example web/package.json web/__tests__/db/reporting-role.test.ts
git commit -m "feat: add reporting_ro role and named reporting views for NL queries"
```

---

### Task 2: SQL validator

**Files:**
- Modify: `web/package.json` (new dependency)
- Create: `web/lib/dal/reporting/sql-validator.ts`
- Test: `web/__tests__/lib/dal/reporting/sql-validator.test.ts`

**Interfaces:**
- Produces: `validateReportingSql(rawSql: string, allowedTables: readonly string[]): SqlValidationResult` and `type SqlValidationResult = { ok: true; sql: string } | { ok: false; reason: string }`, both exported from `web/lib/dal/reporting/sql-validator.ts`. Task 5 imports both.

- [ ] **Step 1: Install the SQL parser**

```bash
cd web
npm install node-sql-parser@5.4.0
```

- [ ] **Step 2: Write the failing tests**

Create `web/__tests__/lib/dal/reporting/sql-validator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateReportingSql } from "@/lib/dal/reporting/sql-validator";

const ALLOWED_TABLES = ["my_animal_state", "my_farms"];

describe("validateReportingSql", () => {
  it("accepts a simple SELECT against an allowed table", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state WHERE status = 'alive'", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
  });

  it("rejects multiple statements", () => {
    const result = validateReportingSql("SELECT 1; DROP TABLE my_animal_state;", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "multiple_statements" });
  });

  it("rejects non-SELECT statements", () => {
    const result = validateReportingSql("DELETE FROM my_animal_state", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "not_a_select" });
  });

  it("rejects tables outside the whitelist", () => {
    const result = validateReportingSql("SELECT * FROM user_account", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "table_not_allowed" });
  });

  it("rejects schema-qualified table references", () => {
    const result = validateReportingSql("SELECT * FROM pg_catalog.pg_roles", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "schema_qualified_table" });
  });

  it("rejects disallowed functions", () => {
    const result = validateReportingSql("SELECT pg_sleep(5) FROM my_animal_state", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "function_not_allowed" });
  });

  it("rejects CTEs", () => {
    const result = validateReportingSql(
      "WITH x AS (SELECT * FROM my_animal_state) SELECT * FROM x",
      ALLOWED_TABLES
    );
    expect(result).toEqual({ ok: false, reason: "cte_not_allowed" });
  });

  it("rejects unparseable input", () => {
    const result = validateReportingSql("not sql at all !!!", ALLOWED_TABLES);
    expect(result.ok).toBe(false);
  });

  it("appends a LIMIT when missing", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toContain("LIMIT 500");
  });

  it("clamps a LIMIT above the max", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state LIMIT 100000", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toContain("LIMIT 500");
  });

  it("keeps a LIMIT already under the max", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state LIMIT 10", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toContain("LIMIT 10");
  });

  it("allows a whitelisted aggregate function", () => {
    const result = validateReportingSql(
      "SELECT status, count(*) FROM my_animal_state GROUP BY status",
      ALLOWED_TABLES
    );
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npx vitest run __tests__/lib/dal/reporting/sql-validator.test.ts`
Expected: FAIL with "Cannot find module '@/lib/dal/reporting/sql-validator'"

- [ ] **Step 4: Write the implementation**

Create `web/lib/dal/reporting/sql-validator.ts`:

```ts
import { Parser } from "node-sql-parser";

const parser = new Parser();

const MAX_ROW_LIMIT = 500;

const ALLOWED_FUNCTIONS = new Set([
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "now",
  "coalesce",
  "lower",
  "upper",
  "trim",
  "round",
  "extract",
  "date_trunc",
  "to_char",
  "concat",
  "length",
  "cast",
]);

export type SqlValidationResult = { ok: true; sql: string } | { ok: false; reason: string };

// Walks the whole AST tree structurally (not tied to specific known keys) so
// function calls nested in subqueries, HAVING, ORDER BY, etc. are all found
// regardless of node-sql-parser's exact shape at each location.
function collectFunctionNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectFunctionNames(item, names);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.type === "aggr_func" && typeof obj.name === "string") {
      names.add(obj.name.toLowerCase());
    }
    if (obj.type === "function" && obj.name && typeof obj.name === "object") {
      const nameParts = (obj.name as { name?: { value?: string }[] }).name;
      if (Array.isArray(nameParts)) {
        for (const part of nameParts) {
          if (part && typeof part.value === "string") names.add(part.value.toLowerCase());
        }
      }
    }
    for (const value of Object.values(obj)) collectFunctionNames(value, names);
  }
}

export function validateReportingSql(rawSql: string, allowedTables: readonly string[]): SqlValidationResult {
  let ast;
  try {
    ast = parser.astify(rawSql, { database: "postgresql" });
  } catch {
    return { ok: false, reason: "not_parseable" };
  }

  if (Array.isArray(ast)) {
    return { ok: false, reason: "multiple_statements" };
  }
  if (ast.type !== "select") {
    return { ok: false, reason: "not_a_select" };
  }
  if (ast.with) {
    return { ok: false, reason: "cte_not_allowed" };
  }

  let tableList: string[];
  try {
    tableList = parser.tableList(rawSql, { database: "postgresql" });
  } catch {
    return { ok: false, reason: "not_parseable" };
  }

  const allowed = new Set(allowedTables.map((t) => t.toLowerCase()));
  for (const entry of tableList) {
    const [, schemaName, tableName] = entry.split("::");
    if (schemaName && schemaName !== "null") {
      return { ok: false, reason: "schema_qualified_table" };
    }
    if (!allowed.has(tableName.toLowerCase())) {
      return { ok: false, reason: "table_not_allowed" };
    }
  }

  const functionNames = new Set<string>();
  collectFunctionNames(ast, functionNames);
  for (const name of functionNames) {
    if (!ALLOWED_FUNCTIONS.has(name)) {
      return { ok: false, reason: "function_not_allowed" };
    }
  }

  if (!ast.limit || ast.limit.value.length === 0) {
    ast.limit = { seperator: "", value: [{ type: "number", value: MAX_ROW_LIMIT }] };
  } else {
    const current = ast.limit.value[0];
    if (current.type === "number" && current.value > MAX_ROW_LIMIT) {
      current.value = MAX_ROW_LIMIT;
    }
  }

  const sql = parser.sqlify(ast, { database: "postgresql" });
  return { ok: true, sql };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npx vitest run __tests__/lib/dal/reporting/sql-validator.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/dal/reporting/sql-validator.ts \
  web/__tests__/lib/dal/reporting/sql-validator.test.ts
git commit -m "feat: add SQL validator for AI-generated reporting queries"
```

---

### Task 3: Scoped temp-view transaction helper

**Files:**
- Create: `web/lib/dal/reporting/scoped-views.ts`
- Test: `web/__tests__/dal/reporting/scoped-views.test.ts`

**Interfaces:**
- Consumes: `reportingPool` from `web/db/reporting.ts` (Task 1); `isAdmin(role)`, `userFarmIds(userId)` from `web/lib/dal/farm-access.ts` (existing).
- Produces: `withScopedReportingViews<T>(userId: string, role: string | undefined, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T>` and `REPORTING_VIEW_NAMES: readonly string[]`, both exported from `web/lib/dal/reporting/scoped-views.ts`. Task 5 imports both.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/dal/reporting/scoped-views.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { testReportingPool } from "../../../test/reporting-db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  userFarm,
  animal,
  batchOperation,
  event,
  eventTransfer,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/db/reporting", () => ({ reportingPool: testReportingPool }));

const { withScopedReportingViews, REPORTING_VIEW_NAMES } = await import("@/lib/dal/reporting/scoped-views");

beforeEach(async () => {
  await resetTestDb();
});

async function seedTwoFarmsWithOneAnimalEach() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: farmNorte.id });

  for (const targetFarm of [farmNorte, farmSur]) {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: targetFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [createdEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: targetFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: createdEvent.id, originFarmId: targetFarm.id, destinationFarmId: targetFarm.id });
  }

  return { manager, admin, farmNorte, farmSur };
}

describe("withScopedReportingViews", () => {
  it("scopes my_animal_state and my_transfer_events to the manager's farm only", async () => {
    const { manager, farmNorte } = await seedTwoFarmsWithOneAnimalEach();

    const rows = await withScopedReportingViews(manager.id, "manager", async (client) => {
      const state = await client.query("SELECT * FROM my_animal_state");
      const transfers = await client.query("SELECT * FROM my_transfer_events");
      return { state: state.rows, transfers: transfers.rows };
    });

    expect(rows.state).toHaveLength(1);
    expect(rows.state[0].current_farm_id).toBe(farmNorte.id);
    expect(rows.transfers).toHaveLength(1);
    expect(rows.transfers[0].farm_id).toBe(farmNorte.id);
  });

  it("gives an admin every farm's rows with the same query", async () => {
    const { admin } = await seedTwoFarmsWithOneAnimalEach();

    const rows = await withScopedReportingViews(admin.id, "admin", async (client) => {
      const state = await client.query("SELECT * FROM my_animal_state");
      return state.rows;
    });

    expect(rows).toHaveLength(2);
  });

  it("exposes exactly the 12 curated view names", () => {
    expect([...REPORTING_VIEW_NAMES].sort()).toEqual(
      [
        "my_animal_state",
        "my_farms",
        "my_paddocks",
        "my_categories",
        "my_products",
        "my_owners",
        "my_transfer_events",
        "my_health_events",
        "my_retag_events",
        "my_recategorize_events",
        "my_sale_events",
        "my_death_events",
      ].sort()
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run __tests__/dal/reporting/scoped-views.test.ts`
Expected: FAIL with "Cannot find module '@/lib/dal/reporting/scoped-views'"

- [ ] **Step 3: Write the implementation**

Create `web/lib/dal/reporting/scoped-views.ts`:

```ts
import type { PoolClient } from "pg";
import { reportingPool } from "@/db/reporting";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

// Farm-scoped views: created as `WHERE <farmColumn> = ANY($1)` for non-admins,
// unfiltered for admins. `source` and `farmColumn` come from this fixed,
// developer-controlled list — never from user or LLM input — so the string
// interpolation used to build the CREATE TEMP VIEW statements below is safe.
const SCOPED_VIEWS_BY_FARM = [
  { name: "my_animal_state", source: "animal_current_state_named", farmColumn: "current_farm_id" },
  { name: "my_farms", source: "farm", farmColumn: "id" },
  { name: "my_paddocks", source: "paddock", farmColumn: "farm_id" },
  { name: "my_transfer_events", source: "transfer_events_named", farmColumn: "farm_id" },
  { name: "my_health_events", source: "health_events_named", farmColumn: "farm_id" },
  { name: "my_retag_events", source: "retag_events_named", farmColumn: "farm_id" },
  { name: "my_recategorize_events", source: "recategorize_events_named", farmColumn: "farm_id" },
  { name: "my_sale_events", source: "sale_events_named", farmColumn: "farm_id" },
  { name: "my_death_events", source: "death_events_named", farmColumn: "farm_id" },
] as const;

// Global catalogs: no farm scoping — same for every user.
const GLOBAL_CATALOG_VIEWS = [
  { name: "my_categories", source: "category" },
  { name: "my_products", source: "product" },
  { name: "my_owners", source: "owner" },
] as const;

export const REPORTING_VIEW_NAMES: readonly string[] = [
  ...SCOPED_VIEWS_BY_FARM.map((v) => v.name),
  ...GLOBAL_CATALOG_VIEWS.map((v) => v.name),
];

export async function withScopedReportingViews<T>(
  userId: string,
  role: string | undefined,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const admin = isAdmin(role);
  const farmIds = admin ? [] : await userFarmIds(userId);

  const client = await reportingPool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");

    for (const view of SCOPED_VIEWS_BY_FARM) {
      if (admin) {
        await client.query(`CREATE TEMP VIEW ${view.name} AS SELECT * FROM ${view.source}`);
      } else {
        await client.query(
          `CREATE TEMP VIEW ${view.name} AS SELECT * FROM ${view.source} WHERE ${view.farmColumn} = ANY($1)`,
          [farmIds]
        );
      }
    }
    for (const view of GLOBAL_CATALOG_VIEWS) {
      await client.query(`CREATE TEMP VIEW ${view.name} AS SELECT * FROM ${view.source}`);
    }

    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run __tests__/dal/reporting/scoped-views.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/lib/dal/reporting/scoped-views.ts web/__tests__/dal/reporting/scoped-views.test.ts
git commit -m "feat: add farm-scoped temp-view transaction helper for reporting queries"
```

---

### Task 4: Gemini SQL generation wrapper

**Files:**
- Modify: `web/package.json` (new dependency)
- Create: `web/lib/dal/reporting/generate-sql.ts`
- Test: `web/__tests__/lib/dal/reporting/generate-sql.test.ts`

**Interfaces:**
- Produces: `generateReportingSql(question: string): Promise<string>` exported from `web/lib/dal/reporting/generate-sql.ts`. Task 5 imports it.
- Consumes: `GEMINI_API_KEY`, `GEMINI_MODEL` (optional), `NL_QUERY_TEST_SQL_OVERRIDE` (test/E2E-only) env vars.

- [ ] **Step 1: Install the Gemini SDK**

```bash
cd web
npm install @google/genai@2.13.0
```

- [ ] **Step 2: Write the failing tests**

Create `web/__tests__/lib/dal/reporting/generate-sql.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn(async () => ({ text: "```sql\nSELECT * FROM my_animal_state;\n```" }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

const { generateReportingSql } = await import("@/lib/dal/reporting/generate-sql");

afterEach(() => {
  delete process.env.NL_QUERY_TEST_SQL_OVERRIDE;
  delete process.env.GEMINI_API_KEY;
  generateContentMock.mockClear();
});

describe("generateReportingSql", () => {
  it("strips markdown fences and a trailing semicolon from the model output", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const sql = await generateReportingSql("¿cuántos animales hay?");
    expect(sql).toBe("SELECT * FROM my_animal_state");
  });

  it("throws when GEMINI_API_KEY is not set and no test override is present", async () => {
    await expect(generateReportingSql("cualquier cosa")).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("returns the override verbatim when NL_QUERY_TEST_SQL_OVERRIDE is set, without calling Gemini", async () => {
    process.env.NL_QUERY_TEST_SQL_OVERRIDE = "SELECT 1";
    const sql = await generateReportingSql("cualquier cosa");
    expect(sql).toBe("SELECT 1");
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npx vitest run __tests__/lib/dal/reporting/generate-sql.test.ts`
Expected: FAIL with "Cannot find module '@/lib/dal/reporting/generate-sql'"

- [ ] **Step 4: Write the implementation**

Create `web/lib/dal/reporting/generate-sql.ts`:

```ts
import { GoogleGenAI } from "@google/genai";

const SCHEMA_DESCRIPTION = `
Tablas disponibles (todas de solo lectura):

my_animal_state(animal_id, current_tag, current_farm_id, farm_name, current_paddock_id, paddock_name, current_category_id, category_name, owner_id, owner_name, status)
  -- status es uno de: 'alive', 'sold', 'dead'
my_farms(id, name)
my_paddocks(id, name, farm_id)
my_categories(id, name, sort_order)
my_products(id, name, default_dose_unit, default_withdrawal_days)
my_owners(id, name)
my_transfer_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, origin_farm_id, origin_farm_name, destination_farm_id, destination_farm_name, origin_paddock_id, origin_paddock_name, destination_paddock_id, destination_paddock_name, guide_number, notes, created_at)
my_health_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, product_id, product_name, dose, dose_unit, route, withdrawal_days, health_notes, notes, created_at)
my_retag_events(event_id, event_date, animal_id, farm_id, farm_name, old_tag, new_tag, notes, created_at)
my_recategorize_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, old_category_id, old_category_name, new_category_id, new_category_name, notes, created_at)
my_sale_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, buyer, price, weight_kg, notes, created_at)
my_death_events(event_id, event_date, animal_id, animal_tag, farm_id, farm_name, cause, notes, created_at)

Reglas:
- Devolvé ÚNICAMENTE una consulta SQL, un solo SELECT, sin punto y coma final, sin explicación, sin markdown.
- Usá exclusivamente las tablas listadas arriba.
- Para "última X", ordená por event_date descendente (y created_at descendente como desempate) y usá LIMIT.
`.trim();

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  return body.trim().replace(/;$/, "");
}

export async function generateReportingSql(question: string): Promise<string> {
  if (process.env.NL_QUERY_TEST_SQL_OVERRIDE) {
    return process.env.NL_QUERY_TEST_SQL_OVERRIDE;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: question,
    config: { systemInstruction: SCHEMA_DESCRIPTION },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned no text");
  }
  return stripMarkdownFences(text);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npx vitest run __tests__/lib/dal/reporting/generate-sql.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/dal/reporting/generate-sql.ts \
  web/__tests__/lib/dal/reporting/generate-sql.test.ts
git commit -m "feat: add Gemini-backed natural-language-to-SQL generator"
```

---

### Task 5: Dashboard query Server Action + i18n keys

**Files:**
- Modify: `web/lib/i18n/dictionaries.ts`
- Create: `web/app/(protected)/dashboard/query-actions.ts`
- Test: `web/__tests__/dashboard/query-actions.test.ts`

**Interfaces:**
- Consumes: `requireSession()` from `web/lib/dal/session.ts`; `generateReportingSql` (Task 4); `validateReportingSql` (Task 2); `withScopedReportingViews`, `REPORTING_VIEW_NAMES` (Task 3).
- Produces: `runNaturalLanguageQuery(question: string): Promise<QueryResult>` and `type QueryResult = { status: "ok"; columns: string[]; rows: Record<string, unknown>[] } | { status: "error"; messageKey: "cantGenerate" | "timeout" | "connectionError" }`, both exported from `web/app/(protected)/dashboard/query-actions.ts`. Tasks 6 and 7 import `QueryResult`; Task 7 imports `runNaturalLanguageQuery`.

- [ ] **Step 1: Add the i18n keys**

In `web/lib/i18n/dictionaries.ts`, add to the `es` object (after `"livestock.byCategoryEmpty"`):

```ts
    "nlQuery.placeholder": "Preguntá algo sobre tus animales, ej: ¿cuál fue la última sanidad del potrero Norte?",
    "nlQuery.submit": "Consultar",
    "nlQuery.submitPending": "Consultando...",
    "nlQuery.emptyResults": "Sin resultados para esta consulta.",
    "nlQuery.errorCantGenerate": "No pude generar una consulta a partir de tu pregunta. Probá reformularla.",
    "nlQuery.errorTimeout": "La consulta tardó demasiado. Probá con una pregunta más simple o específica.",
    "nlQuery.errorConnection": "No se pudo conectar con el asistente. Probá de nuevo en un momento.",
```

And the matching keys to the `en` object (after `"livestock.byCategoryEmpty"`):

```ts
    "nlQuery.placeholder": "Ask something about your animals, e.g.: what was the last health event in the North paddock?",
    "nlQuery.submit": "Query",
    "nlQuery.submitPending": "Querying...",
    "nlQuery.emptyResults": "No results for this query.",
    "nlQuery.errorCantGenerate": "I couldn't build a query from your question. Try rephrasing it.",
    "nlQuery.errorTimeout": "The query took too long. Try a simpler or more specific question.",
    "nlQuery.errorConnection": "Couldn't reach the assistant. Try again in a moment.",
```

- [ ] **Step 2: Write the failing test**

Create `web/__tests__/dashboard/query-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { testDb } from "../../test/db";
import { testReportingPool } from "../../test/reporting-db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, animal, batchOperation, event, eventTransfer } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/db/reporting", () => ({ reportingPool: testReportingPool }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { runNaturalLanguageQuery } = await import("@/app/(protected)/dashboard/query-actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
  process.env.NL_QUERY_TEST_SQL_OVERRIDE = "SELECT status, count(*) as total FROM my_animal_state GROUP BY status";
  vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
});

async function seedTwoFarmsWithOneAnimalEach() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: farmNorte.id });

  for (const targetFarm of [farmNorte, farmSur]) {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: targetFarm.id, animalCount: 1, createdBy: admin.id })
      .returning();
    const [createdEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: targetFarm.id,
        batchOperationId: batch.id,
        createdBy: admin.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: createdEvent.id, originFarmId: targetFarm.id, destinationFarmId: targetFarm.id });
  }

  return { manager, admin };
}

describe("runNaturalLanguageQuery", () => {
  it("returns only the manager's farm data even when the generated SQL has no farm filter", async () => {
    const { manager } = await seedTwoFarmsWithOneAnimalEach();
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    const result = await runNaturalLanguageQuery("¿cuántos animales por estado?");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const total = result.rows.reduce((sum, row) => sum + Number(row.total), 0);
      expect(total).toBe(1);
    }
  });

  it("returns every farm's data for an admin with the same query", async () => {
    const { admin } = await seedTwoFarmsWithOneAnimalEach();
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, role: "admin" } } as never);

    const result = await runNaturalLanguageQuery("¿cuántos animales por estado?");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const total = result.rows.reduce((sum, row) => sum + Number(row.total), 0);
      expect(total).toBe(2);
    }
  });

  it("returns a generic error when the generated SQL fails validation", async () => {
    const { manager } = await seedTwoFarmsWithOneAnimalEach();
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);
    process.env.NL_QUERY_TEST_SQL_OVERRIDE = "DROP TABLE my_animal_state";

    const result = await runNaturalLanguageQuery("borrá todo");

    expect(result).toEqual({ status: "error", messageKey: "cantGenerate" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/dashboard/query-actions.test.ts`
Expected: FAIL with "Cannot find module '@/app/(protected)/dashboard/query-actions'"

- [ ] **Step 4: Write the implementation**

Create `web/app/(protected)/dashboard/query-actions.ts`:

```ts
"use server";

import { requireSession } from "@/lib/dal/session";
import { generateReportingSql } from "@/lib/dal/reporting/generate-sql";
import { validateReportingSql } from "@/lib/dal/reporting/sql-validator";
import { withScopedReportingViews, REPORTING_VIEW_NAMES } from "@/lib/dal/reporting/scoped-views";

export type QueryResult =
  | { status: "ok"; columns: string[]; rows: Record<string, unknown>[] }
  | { status: "error"; messageKey: "cantGenerate" | "timeout" | "connectionError" };

export async function runNaturalLanguageQuery(question: string): Promise<QueryResult> {
  const session = await requireSession();

  let generatedSql: string;
  try {
    generatedSql = await generateReportingSql(question);
  } catch {
    return { status: "error", messageKey: "connectionError" };
  }

  const validated = validateReportingSql(generatedSql, REPORTING_VIEW_NAMES);
  if (!validated.ok) {
    return { status: "error", messageKey: "cantGenerate" };
  }

  try {
    return await withScopedReportingViews(session.user.id, session.user.role, async (client) => {
      const result = await client.query(validated.sql);
      return {
        status: "ok" as const,
        columns: result.fields.map((field) => field.name),
        rows: result.rows,
      };
    });
  } catch (error) {
    if (error instanceof Error && /timeout/i.test(error.message)) {
      return { status: "error", messageKey: "timeout" };
    }
    return { status: "error", messageKey: "cantGenerate" };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/dashboard/query-actions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add web/lib/i18n/dictionaries.ts "web/app/(protected)/dashboard/query-actions.ts" \
  web/__tests__/dashboard/query-actions.test.ts
git commit -m "feat: add runNaturalLanguageQuery server action with farm-scoped security test"
```

---

### Task 6: `QueryResultTable` component

**Files:**
- Create: `web/components/dashboard/query-result-table.tsx`
- Test: `web/__tests__/components/dashboard/query-result-table.test.tsx`

**Interfaces:**
- Consumes: `translate`, `type Locale` from `@/lib/i18n/dictionaries` (existing).
- Produces: `QueryResultTable({ columns, rows, locale }: { columns: string[]; rows: Record<string, unknown>[]; locale: Locale }): JSX.Element`, exported from `web/components/dashboard/query-result-table.tsx`. Task 7 imports it.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/components/dashboard/query-result-table.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryResultTable } from "@/components/dashboard/query-result-table";

afterEach(cleanup);

describe("QueryResultTable", () => {
  it("renders dynamic columns and row values", () => {
    render(
      <QueryResultTable
        columns={["farm_name", "total"]}
        rows={[{ farm_name: "Campo Norte", total: 3 }]}
        locale="es"
      />
    );

    expect(screen.getByText("farm_name")).toBeInTheDocument();
    expect(screen.getByText("total")).toBeInTheDocument();
    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows a placeholder for null values", () => {
    render(<QueryResultTable columns={["notes"]} rows={[{ notes: null }]} locale="es" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no rows", () => {
    render(<QueryResultTable columns={[]} rows={[]} locale="es" />);
    expect(screen.getByText("Sin resultados para esta consulta.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/components/dashboard/query-result-table.test.tsx`
Expected: FAIL with "Cannot find module '@/components/dashboard/query-result-table'"

- [ ] **Step 3: Write the implementation**

Create `web/components/dashboard/query-result-table.tsx`:

```tsx
import { translate, type Locale } from "@/lib/i18n/dictionaries";

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function QueryResultTable({
  columns,
  rows,
  locale,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  locale: Locale;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">{translate(locale, "nlQuery.emptyResults")}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          {columns.map((column) => (
            <th key={column} className="py-1 pr-2">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b last:border-0">
            {columns.map((column) => (
              <td key={column} className="py-1 pr-2">
                {formatCellValue(row[column])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/components/dashboard/query-result-table.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/query-result-table.tsx \
  web/__tests__/components/dashboard/query-result-table.test.tsx
git commit -m "feat: add QueryResultTable component with dynamic columns"
```

---

### Task 7: `NaturalLanguageQuery` client component

**Files:**
- Create: `web/components/dashboard/natural-language-query.tsx`
- Test: `web/__tests__/components/dashboard/natural-language-query.test.tsx`

**Interfaces:**
- Consumes: `runNaturalLanguageQuery`, `type QueryResult` from `@/app/(protected)/dashboard/query-actions` (Task 5); `QueryResultTable` (Task 6); `Button` from `@/components/ui/button` (existing); `translate`, `type Locale` from `@/lib/i18n/dictionaries` (existing).
- Produces: `NaturalLanguageQuery({ locale }: { locale: Locale }): JSX.Element`, exported from `web/components/dashboard/natural-language-query.tsx`. Task 8 imports it.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/components/dashboard/natural-language-query.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NaturalLanguageQuery } from "@/components/dashboard/natural-language-query";
import { runNaturalLanguageQuery } from "@/app/(protected)/dashboard/query-actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/dashboard/query-actions", () => ({
  runNaturalLanguageQuery: vi.fn(),
}));

describe("NaturalLanguageQuery", () => {
  it("submits the question and renders the resulting table", async () => {
    vi.mocked(runNaturalLanguageQuery).mockResolvedValue({
      status: "ok",
      columns: ["farm_name", "total"],
      rows: [{ farm_name: "Campo Norte", total: 3 }],
    });

    render(<NaturalLanguageQuery locale="es" />);
    await userEvent.type(screen.getByPlaceholderText(/pregunt/i), "¿cuántos animales hay?");
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() => expect(screen.getByText("Campo Norte")).toBeInTheDocument());
    expect(runNaturalLanguageQuery).toHaveBeenCalledWith("¿cuántos animales hay?");
  });

  it("shows the generic error message when the action returns an error", async () => {
    vi.mocked(runNaturalLanguageQuery).mockResolvedValue({ status: "error", messageKey: "cantGenerate" });

    render(<NaturalLanguageQuery locale="es" />);
    await userEvent.type(screen.getByPlaceholderText(/pregunt/i), "algo raro");
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() =>
      expect(
        screen.getByText("No pude generar una consulta a partir de tu pregunta. Probá reformularla.")
      ).toBeInTheDocument()
    );
  });

  it("disables the submit button while the question is empty", () => {
    render(<NaturalLanguageQuery locale="es" />);
    expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/components/dashboard/natural-language-query.test.tsx`
Expected: FAIL with "Cannot find module '@/components/dashboard/natural-language-query'"

- [ ] **Step 3: Write the implementation**

Create `web/components/dashboard/natural-language-query.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";
import { runNaturalLanguageQuery, type QueryResult } from "@/app/(protected)/dashboard/query-actions";
import { QueryResultTable } from "@/components/dashboard/query-result-table";

const ERROR_MESSAGE_KEYS: Record<Extract<QueryResult, { status: "error" }>["messageKey"], TranslationKey> = {
  cantGenerate: "nlQuery.errorCantGenerate",
  timeout: "nlQuery.errorTimeout",
  connectionError: "nlQuery.errorConnection",
};

export function NaturalLanguageQuery({ locale }: { locale: Locale }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const response = await runNaturalLanguageQuery(question);
      setResult(response);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-20 w-full rounded-lg border p-2 text-sm"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={translate(locale, "nlQuery.placeholder")}
      />
      <div>
        <Button onClick={handleSubmit} disabled={isPending || question.trim().length === 0}>
          {isPending ? translate(locale, "nlQuery.submitPending") : translate(locale, "nlQuery.submit")}
        </Button>
      </div>
      {result?.status === "ok" && <QueryResultTable columns={result.columns} rows={result.rows} locale={locale} />}
      {result?.status === "error" && (
        <p className="text-destructive">{translate(locale, ERROR_MESSAGE_KEYS[result.messageKey])}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/components/dashboard/natural-language-query.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/natural-language-query.tsx \
  web/__tests__/components/dashboard/natural-language-query.test.tsx
git commit -m "feat: add NaturalLanguageQuery client component"
```

---

### Task 8: Wire into the dashboard page + E2E test

**Files:**
- Modify: `web/app/(protected)/dashboard/page.tsx`
- Modify: `web/playwright.config.ts`
- Create: `web/e2e/nl-query.spec.ts`

**Interfaces:**
- Consumes: `NaturalLanguageQuery` (Task 7).

Playwright cannot intercept this feature's outbound Gemini call at the network level — that request is made server-side, inside the Next.js process, and never passes through the browser page Playwright controls. Instead, the dev server started for E2E is given `NL_QUERY_TEST_SQL_OVERRIDE` (already wired in Task 4's `generateReportingSql`), which returns fixed SQL without calling Gemini at all.

- [ ] **Step 1: Wire the component into the dashboard page**

In `web/app/(protected)/dashboard/page.tsx`, add the import:

```ts
import { NaturalLanguageQuery } from "@/components/dashboard/natural-language-query";
```

And add the section as the first child inside the returned `<div className="flex flex-col gap-6">`, right after the `<h1>` title block and before the "Stock por potrero" block:

```tsx
      <div>
        <NaturalLanguageQuery locale={locale} />
      </div>
```

- [ ] **Step 2: Point the E2E dev server at a fixed SQL override**

In `web/playwright.config.ts`, add `NL_QUERY_TEST_SQL_OVERRIDE` to the existing `webServer.env` block:

```ts
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      DATABASE_URL_REPORTING: process.env.DATABASE_URL_REPORTING_TEST ?? "",
      NL_QUERY_TEST_SQL_OVERRIDE: "SELECT status, count(*) as total FROM my_animal_state GROUP BY status",
    },
```

- [ ] **Step 3: Write the E2E spec**

Create `web/e2e/nl-query.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("asks a natural-language question and sees a results table", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);

  await page.getByPlaceholder(/pregunt/i).fill("¿Cuántos animales hay por estado?");
  await page.getByRole("button", { name: /consultar/i }).click();

  await expect(page.getByRole("columnheader", { name: "status" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "total" })).toBeVisible();
});
```

- [ ] **Step 4: Run the full unit/integration suite**

Run: `cd web && npm test`
Expected: PASS, all test files including every one added in Tasks 1–7.

- [ ] **Step 5: Run the E2E suite**

Run: `cd web && npm run test:e2e -- nl-query.spec.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Run the type checker**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors introduced by this feature (pre-existing unrelated `Buffer`/`BlobPart` errors in `__tests__/activities/*.test.ts` are a known, unrelated issue — see commit `29fa40c`'s history).

- [ ] **Step 7: Commit**

```bash
git add "web/app/(protected)/dashboard/page.tsx" web/playwright.config.ts web/e2e/nl-query.spec.ts
git commit -m "feat: wire natural-language query into the dashboard, add e2e coverage"
```
