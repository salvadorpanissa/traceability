# Paddocks Schema (Drizzle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `paddock` entity and wire it into `event_transfer` and `animal_current_state`, as described in [`docs/superpowers/specs/2026-07-21-paddocks-schema-drizzle-design.md`](../specs/2026-07-21-paddocks-schema-drizzle-design.md).

**Architecture:** Purely additive on top of the schema merged in `2026-07-21-core-schema-drizzle-implementation.md` — no existing column, table, or row meaning changes. `paddock` and the two new `event_transfer` columns are added the standard way (`drizzle-kit generate`). `animal_current_state` cannot gain a computed column via `ALTER MATERIALIZED VIEW`, so Task 3 drops and recreates the view, its unique index, its refresh function, and all 7 refresh triggers in one hand-written migration — verified against the *entire* existing test suite, not just its own new test, since a mistake here would silently break every other derived-state test.

**Tech Stack:** Same as the core schema port — Drizzle ORM 0.45, `drizzle-kit`, Postgres local, Vitest integration tests against `DATABASE_URL_TEST`.

## Global Constraints

- Every migration in this plan is additive on top of a schema already merged to `main`: no existing column is dropped, no existing row's meaning changes.
- `paddock` is optional everywhere it's referenced (`origin_paddock_id`, `destination_paddock_id`, `current_paddock_id` are all nullable).
- `requireTransferAuthorization` (`web/lib/dal/animal-access.ts`) is **not modified** in this plan — per the spec, its existing `originFarmId === destinationFarmId` check already produces the desired behavior for potrero-to-potrero transfers within the same establishment.
- After Task 3's migration, the full existing test suite (`npm run test`, all 16+ files) must still pass — this is the regression gate for touching the derived-state pipeline.

---

## Task 1: `paddock` table

**Files:**
- Create: `web/db/schema/paddock.ts`
- Modify: `web/db/schema/index.ts`
- Modify: `web/test/reset-db.ts`
- Create: `web/__tests__/schema/paddock.test.ts`

**Interfaces:**
- Produces: `paddock(id, farmId, name)`, exported from `@/db/schema`.
- Consumes: `farm` (existing).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/schema/paddock.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, paddock } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("paddock table", () => {
  it("belongs to a farm and requires a name", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [created] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero 1" }).returning();

    expect(created.name).toBe("Potrero 1");
    expect(created.farmId).toBe(seededFarm.id);

    await expect(
      testDb.insert(paddock).values({ farmId: seededFarm.id, name: null as unknown as string })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- schema/paddock.test.ts
```

Expected: FAIL — `paddock` not exported from `@/db/schema`.

- [ ] **Step 3: Write the schema file**

Create `web/db/schema/paddock.ts`:

```typescript
import { pgTable, uuid, text } from "drizzle-orm/pg-core";
import { farm } from "./farm";

export const paddock = pgTable("paddock", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farm.id),
  name: text("name").notNull(),
});
```

Modify `web/db/schema/index.ts` (add one line):

```typescript
export * from "./paddock";
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd web && npm run db:generate
npm run db:migrate:test
npm run db:migrate
```

Expected: new migration file with `CREATE TABLE "paddock"` and its FK to `farm`; both migrate commands succeed.

- [ ] **Step 5: Extend the test-db reset helper**

Modify `web/test/reset-db.ts` — add before the `farm` truncate (paddock is a child of farm):

```typescript
  await testDb.execute(sql`TRUNCATE TABLE paddock CASCADE`);
```

(Placed immediately before the existing `TRUNCATE TABLE farm RESTART IDENTITY CASCADE` line.)

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test -- schema/paddock.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 7: Commit**

```bash
git add db/schema/paddock.ts db/schema/index.ts drizzle/ test/reset-db.ts __tests__/schema/paddock.test.ts
git commit -m "feat: add paddock table scoped to a farm"
```

---

## Task 2: `event_transfer` gains optional paddock columns

**Files:**
- Modify: `web/db/schema/event-children.ts`
- Modify: `web/test/reset-db.ts` (no change needed — no new table)
- Create: `web/__tests__/schema/event-transfer-paddock.test.ts`

**Interfaces:**
- Produces columns: `eventTransfer.originPaddockId` (nullable, fk → `paddock`), `eventTransfer.destinationPaddockId` (nullable, fk → `paddock`).
- Consumes: `eventTransfer` (existing, `web/db/schema/event-children.ts`), `paddock` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/schema/event-transfer-paddock.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event, eventTransfer, paddock } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("event_transfer paddock columns", () => {
  it("accepts origin/destination paddocks, both optional", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [potreroA] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero A" }).returning();
    const [potreroB] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero B" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [createdEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
      .returning();

    const [withPaddocks] = await testDb
      .insert(eventTransfer)
      .values({
        eventId: createdEvent.id,
        originFarmId: seededFarm.id,
        destinationFarmId: seededFarm.id,
        originPaddockId: potreroA.id,
        destinationPaddockId: potreroB.id,
      })
      .returning();
    expect(withPaddocks.originPaddockId).toBe(potreroA.id);
    expect(withPaddocks.destinationPaddockId).toBe(potreroB.id);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- event-transfer-paddock.test.ts
```

Expected: FAIL — `originPaddockId`/`destinationPaddockId` not recognized properties (TypeScript error or runtime column-not-found).

- [ ] **Step 3: Modify the schema file**

Modify `web/db/schema/event-children.ts` — update the import and the `eventTransfer` table definition:

```typescript
import { pgTable, uuid, text, numeric, integer } from "drizzle-orm/pg-core";
import { event } from "./event";
import { farm } from "./farm";
import { product } from "./product";
import { category } from "./category";
import { paddock } from "./paddock";

export const eventTransfer = pgTable("event_transfer", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  originFarmId: uuid("origin_farm_id")
    .notNull()
    .references(() => farm.id),
  destinationFarmId: uuid("destination_farm_id")
    .notNull()
    .references(() => farm.id),
  guideNumber: text("guide_number"),
  originPaddockId: uuid("origin_paddock_id").references(() => paddock.id),
  destinationPaddockId: uuid("destination_paddock_id").references(() => paddock.id),
});
```

(The rest of the file — `eventHealth`, `eventRetag`, `eventRecategorize`, `eventSale`, `eventDeath` — is unchanged.)

- [ ] **Step 4: Generate and apply the migration**

```bash
cd web && npm run db:generate
npm run db:migrate:test
npm run db:migrate
```

Expected: new migration file with `ALTER TABLE "event_transfer" ADD COLUMN "origin_paddock_id" ...` and `"destination_paddock_id"`, plus their FKs; both migrate commands succeed.

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm run test -- event-transfer-paddock.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add db/schema/event-children.ts drizzle/ __tests__/schema/event-transfer-paddock.test.ts
git commit -m "feat: add optional origin/destination paddock columns to event_transfer"
```

---

## Task 3: Derived state gains `current_paddock_id`

**Files:**
- Create: `web/drizzle/<NNNN>_add_paddock_to_derived_state.sql` (hand-written, via `drizzle-kit generate --custom`)
- Create: `web/__tests__/derived-state-paddock.test.ts`

**Interfaces:**
- Produces: `animal_current_state.current_paddock_id`.
- Rebuilds (identically, byte-for-byte except the one added column and its one added source line) the objects created in the core-schema port's Task 5: the materialized view `animal_current_state`, its unique index, the function `refresh_animal_current_state()`, and its 7 triggers (on `event` and its 6 child tables).
- Consumes: `eventTransfer.destinationPaddockId` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/derived-state-paddock.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../test/db";
import { resetTestDb } from "../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event, eventTransfer, paddock } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function currentPaddockIdFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_paddock_id: string | null }>(
    sql`select current_paddock_id from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.current_paddock_id ?? null;
}

describe("animal_current_state.current_paddock_id", () => {
  it("reflects the destination paddock after a same-farm transfer, and stays null without one", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [potreroA] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero A" }).returning();
    const [potreroB] = await testDb.insert(paddock).values({ farmId: seededFarm.id, name: "Potrero B" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();

    // Animal 1: transfer with paddocks specified.
    const [animalWithPaddock] = await testDb.insert(animal).values({}).returning();
    const [batch1] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [event1] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: animalWithPaddock.id,
        farmId: seededFarm.id,
        batchOperationId: batch1.id,
        createdBy: user.id,
      })
      .returning();
    await testDb.insert(eventTransfer).values({
      eventId: event1.id,
      originFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      originPaddockId: potreroA.id,
      destinationPaddockId: potreroB.id,
    });

    expect(await currentPaddockIdFor(animalWithPaddock.id)).toBe(potreroB.id);

    // Animal 2: transfer without a paddock specified.
    const [animalWithoutPaddock] = await testDb.insert(animal).values({}).returning();
    const [batch2] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [event2] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: animalWithoutPaddock.id,
        farmId: seededFarm.id,
        batchOperationId: batch2.id,
        createdBy: user.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: event2.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id });

    expect(await currentPaddockIdFor(animalWithoutPaddock.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- derived-state-paddock.test.ts
```

Expected: FAIL — `column "current_paddock_id" does not exist`.

- [ ] **Step 3: Generate an empty custom migration**

```bash
cd web && npx drizzle-kit generate --custom --name=add_paddock_to_derived_state
```

Expected: creates an empty `web/drizzle/<NNNN>_add_paddock_to_derived_state.sql`.

- [ ] **Step 4: Write the migration SQL**

Edit the generated file:

```sql
-- Materialized views have no `ALTER ... AS` to add a computed column — the
-- defining query can only be replaced via DROP + CREATE. This drops every
-- object that depends on animal_current_state, in dependency order, and
-- recreates each one identically except for the one added column below.

drop trigger event_death_refresh_animal_current_state on event_death;
drop trigger event_sale_refresh_animal_current_state on event_sale;
drop trigger event_recategorize_refresh_animal_current_state on event_recategorize;
drop trigger event_retag_refresh_animal_current_state on event_retag;
drop trigger event_health_refresh_animal_current_state on event_health;
drop trigger event_transfer_refresh_animal_current_state on event_transfer;
drop trigger event_refresh_animal_current_state on event;

drop function refresh_animal_current_state();
drop materialized view animal_current_state;

create materialized view animal_current_state as
with active_event as (
  select e.*
  from event e
  where e.event_type <> 'void'
    and not exists (
      select 1 from event v
      where v.event_type = 'void' and v.voids_event_id = e.id
    )
),
last_retag as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_tag
  from active_event ae
  join event_retag r on r.event_id = ae.id
  where ae.event_type = 'retag'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_transfer as (
  select distinct on (ae.animal_id) ae.animal_id, t.destination_farm_id, t.destination_paddock_id
  from active_event ae
  join event_transfer t on t.event_id = ae.id
  where ae.event_type = 'transfer'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_recategorize as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_category_id
  from active_event ae
  join event_recategorize r on r.event_id = ae.id
  where ae.event_type = 'recategorize'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_sale as (
  select distinct on (ae.animal_id) ae.animal_id, ae.event_date, ae.created_at
  from active_event ae
  where ae.event_type = 'sale'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_death as (
  select distinct on (ae.animal_id) ae.animal_id, ae.event_date, ae.created_at
  from active_event ae
  where ae.event_type = 'death'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
)
select
  a.id as animal_id,
  lr.new_tag as current_tag,
  lt.destination_farm_id as current_farm_id,
  lt.destination_paddock_id as current_paddock_id,
  lc.new_category_id as current_category_id,
  case
    when ld.animal_id is not null
      and (ls.animal_id is null or (ld.event_date, ld.created_at) > (ls.event_date, ls.created_at))
      then 'dead'
    when ls.animal_id is not null then 'sold'
    else 'alive'
  end as status
from animal a
left join last_retag lr on lr.animal_id = a.id
left join last_transfer lt on lt.animal_id = a.id
left join last_recategorize lc on lc.animal_id = a.id
left join last_sale ls on ls.animal_id = a.id
left join last_death ld on ld.animal_id = a.id;
--> statement-breakpoint
create unique index animal_current_state_animal_id_idx on animal_current_state(animal_id);
--> statement-breakpoint
create or replace function refresh_animal_current_state()
returns trigger
language plpgsql
as $$
begin
  refresh materialized view concurrently animal_current_state;
  return null;
end;
$$;
--> statement-breakpoint
create trigger event_refresh_animal_current_state
after insert on event
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_transfer_refresh_animal_current_state
after insert on event_transfer
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_health_refresh_animal_current_state
after insert on event_health
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_retag_refresh_animal_current_state
after insert on event_retag
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_recategorize_refresh_animal_current_state
after insert on event_recategorize
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_sale_refresh_animal_current_state
after insert on event_sale
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_death_refresh_animal_current_state
after insert on event_death
for each statement
execute function refresh_animal_current_state();
```

- [ ] **Step 5: Apply the migration**

```bash
npm run db:migrate:test
npm run db:migrate
```

Expected: both print `Migrations applied to ...` with no errors.

- [ ] **Step 6: Run the new test and confirm it passes**

```bash
npm run test -- derived-state-paddock.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file (this is the critical regression check — the drop/recreate must reproduce the exact same derived-state behavior the existing `derived-state.test.ts` already exercises).

- [ ] **Step 8: Commit**

```bash
git add drizzle/ __tests__/derived-state-paddock.test.ts
git commit -m "feat: add current_paddock_id to the derived-state view"
```

---

## Post-plan note

This plan completes the second and final prerequisite for "carga de caravanas y actividades" (`docs/superpowers/specs/2026-07-20-activity-loading-design.md`). No frontend or paddock-management UI is included — paddocks are created directly against the database in the meantime, same as farms/categories/products today. The next plan can proceed straight to the batch-operation orchestration Server Actions and Excel import/validation UI.
