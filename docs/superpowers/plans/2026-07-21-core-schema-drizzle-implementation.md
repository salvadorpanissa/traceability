# Core Schema (Drizzle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the animal/event/catalog schema to Drizzle on Postgres local, as described in [`docs/superpowers/specs/2026-07-21-core-schema-drizzle-design.md`](../specs/2026-07-21-core-schema-drizzle-design.md).

**Architecture:** Standard tables (`category`, `product`, `animal`, `animal_tag_history`, `batch_operation`, `event`, and the six `event_*` child tables) are defined as typed Drizzle schema files under `web/db/schema/`, migrated via `drizzle-kit generate` + `db:migrate`/`db:migrate:test` — same flow already used for `farm`/`role`/`user_account`. The derived-state materialized view and its refresh triggers cannot be expressed in Drizzle's schema DSL, so they're added via one hand-written SQL migration (`drizzle-kit generate --custom`). There is no RLS and no wrapper view: Postgres local has one application-level DB role (no `authenticated`/`anon`/`service_role` split), so farm-scoping happens entirely in the DAL (`web/lib/dal/`), reusing `isAdmin`/`userFarmIds`/`requireFarmAccess` from the auth-shell-v2 work and adding one new file, `web/lib/dal/animal-access.ts`, for the event-domain-specific checks (cross-farm transfer authorization, farm-scoped current-state reads).

**Tech Stack:** Drizzle ORM 0.45 (`drizzle-orm/node-postgres`), `drizzle-kit` migrations, Postgres 16 (local Docker, `docker-compose.yml`), Vitest integration tests against `DATABASE_URL_TEST` (same pattern as `web/__tests__/schema/*.test.ts`). No pgTAP, no Supabase, no RLS.

## Global Constraints

- All table/column names in English, `snake_case` in Postgres / `camelCase` in Drizzle — matches `farm`/`role`/`user_account` already in the codebase.
- Every uuid primary key defaults to `gen_random_uuid()` (already the project convention — `pgcrypto`/`gen_random_uuid()` works out of the box on Postgres 13+, no extension needed).
- `event` rows are immutable: the schema never gets an `UPDATE`/`DELETE` code path in this plan — enforcement is "the DAL/Server Actions never call `.update()`/`.delete()` on these tables," there is no DB-level privilege backstop (no RLS in this stack).
- All money/measurement values use `numeric`, never `float`/`double precision` (`event_health.dose`, `event_sale.price`/`weight_kg`).
- Farm-scoped authorization for every new table happens in the DAL via `requireFarmAccess`/`isAdmin`/`userFarmIds` (`web/lib/dal/farm-access.ts`) or the new `web/lib/dal/animal-access.ts` — never assume a query is safe just because it compiles; every DAL function that reads/writes `animal`/`event`/`batch_operation`/derived state must take a `role`/`userId` and enforce access before touching the DB.
- Every task's Vitest file runs against `testDb` (`web/test/db.ts`) with `resetTestDb()` (`web/test/reset-db.ts`) in `beforeEach` — extend `resetTestDb()`'s `TRUNCATE` list in the same task that introduces a new table, in FK-safe order (children before parents).
- Only `admin` may create a transfer where `origin_farm_id <> destination_farm_id` — enforced in `web/lib/dal/animal-access.ts`, not at the DB layer.

---

## Task 1: Catalogs — `category` and `product`

**Files:**
- Create: `web/db/schema/category.ts`
- Create: `web/db/schema/product.ts`
- Modify: `web/db/schema/index.ts`
- Modify: `web/test/reset-db.ts`
- Create: `web/__tests__/schema/catalogs.test.ts`

**Interfaces:**
- Produces: `category(id, name, sortOrder)`, `product(id, name, defaultDoseUnit, defaultWithdrawalDays)` — both exported from `@/db/schema`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/schema/catalogs.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { category, product } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("category table", () => {
  it("stores a category with a sort order defaulting to 0", async () => {
    const [created] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    expect(created.name).toBe("Vaca");
    expect(created.sortOrder).toBe(0);

    await expect(testDb.insert(category).values({ name: "Vaca" })).rejects.toThrow();
  });
});

describe("product table", () => {
  it("stores a product with optional dose unit and withdrawal days", async () => {
    const [created] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    expect(created.name).toBe("Ivermectina 1%");
    expect(created.defaultDoseUnit).toBeNull();
    expect(created.defaultWithdrawalDays).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- catalogs.test.ts
```

Expected: FAIL — `Cannot find module '@/db/schema'` export `category`/`product` (or a runtime error that the table doesn't exist, depending on how far TypeScript gets).

- [ ] **Step 3: Write the schema files**

Create `web/db/schema/category.ts`:

```typescript
import { pgTable, uuid, text, integer } from "drizzle-orm/pg-core";

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});
```

Create `web/db/schema/product.ts`:

```typescript
import { pgTable, uuid, text, integer } from "drizzle-orm/pg-core";

export const product = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  defaultDoseUnit: text("default_dose_unit"),
  defaultWithdrawalDays: integer("default_withdrawal_days"),
});
```

Modify `web/db/schema/index.ts` (add two lines):

```typescript
export * from "./role";
export * from "./farm";
export * from "./user";
export * from "./category";
export * from "./product";
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd web && npm run db:generate
```

Expected: a new file appears under `web/drizzle/` (e.g. `0002_<random-name>.sql`) containing `CREATE TABLE "category" ...` and `CREATE TABLE "product" ...`, and `web/drizzle/meta/_journal.json` gains a new entry.

```bash
npm run db:migrate:test
npm run db:migrate
```

Expected: both print `Migrations applied to ...` with no errors.

- [ ] **Step 5: Extend the test-db reset helper**

Modify `web/test/reset-db.ts` — add the two new tables to the truncate list (order doesn't matter for these two, they have no FKs, but keep them grouped together for readability):

```typescript
import { sql } from "drizzle-orm";
import { testDb } from "./db";

export async function resetTestDb() {
  // Truncate in FK-safe order: children before parents
  await testDb.execute(sql`TRUNCATE TABLE user_farm CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE user_account RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE farm RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE role RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE category RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE product RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test -- catalogs.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add db/schema/category.ts db/schema/product.ts db/schema/index.ts drizzle/ test/reset-db.ts __tests__/schema/catalogs.test.ts
git commit -m "feat: add category and product catalog tables"
```

---

## Task 2: Animal core — `animal` and `animal_tag_history`

**Files:**
- Create: `web/db/schema/animal.ts`
- Modify: `web/db/schema/index.ts`
- Modify: `web/test/reset-db.ts`
- Create: `web/__tests__/schema/animal-core.test.ts`

**Interfaces:**
- Produces: `animal(id, birthDate, createdAt)`, `animalTagHistory(id, animalId, tag, validFrom)` — both exported from `@/db/schema`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/schema/animal-core.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { animal, animalTagHistory } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("animal table", () => {
  it("stores an animal with a nullable birth date and no state columns", async () => {
    const [created] = await testDb.insert(animal).values({}).returning();
    expect(created.birthDate).toBeNull();
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created).not.toHaveProperty("currentFarmId");
    expect(created).not.toHaveProperty("status");
  });
});

describe("animal_tag_history table", () => {
  it("links a tag to an animal and requires a tag value", async () => {
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    const [tagRow] = await testDb
      .insert(animalTagHistory)
      .values({ animalId: createdAnimal.id, tag: "AR123456789012" })
      .returning();
    expect(tagRow.tag).toBe("AR123456789012");
    expect(tagRow.validFrom).toBeInstanceOf(Date);

    await expect(
      testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: null as unknown as string })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- animal-core.test.ts
```

Expected: FAIL — `animal`/`animalTagHistory` not exported from `@/db/schema`.

- [ ] **Step 3: Write the schema file**

Create `web/db/schema/animal.ts`:

```typescript
import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";

export const animal = pgTable("animal", {
  id: uuid("id").primaryKey().defaultRandom(),
  birthDate: date("birth_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const animalTagHistory = pgTable(
  "animal_tag_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("animal_tag_history_animal_id_idx").on(table.animalId), index("animal_tag_history_tag_idx").on(table.tag)]
);
```

Modify `web/db/schema/index.ts` (add one line):

```typescript
export * from "./animal";
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd web && npm run db:generate
npm run db:migrate:test
npm run db:migrate
```

Expected: new migration file with `CREATE TABLE "animal"`, `CREATE TABLE "animal_tag_history"`, and both indexes; both migrate commands succeed.

- [ ] **Step 5: Extend the test-db reset helper**

Modify `web/test/reset-db.ts` — add before the `category`/`product` lines (children before the parents they don't actually share a parent with, but keep animal's own child first):

```typescript
  await testDb.execute(sql`TRUNCATE TABLE animal_tag_history CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE animal RESTART IDENTITY CASCADE`);
```

(Full file after this edit truncates, in order: `animal_tag_history`, `animal`, `user_farm`, `user_account`, `farm`, `role`, `category`, `product`.)

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test -- animal-core.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add db/schema/animal.ts db/schema/index.ts drizzle/ test/reset-db.ts __tests__/schema/animal-core.test.ts
git commit -m "feat: add animal and animal_tag_history tables"
```

---

## Task 3: Event core — `batch_operation` and `event`

**Files:**
- Create: `web/db/schema/event.ts`
- Modify: `web/db/schema/index.ts`
- Modify: `web/test/reset-db.ts`
- Create: `web/__tests__/schema/event-core.test.ts`

**Interfaces:**
- Produces: `batchOperation(id, eventType, farmId, selectionCriteria, animalCount, createdBy, createdAt)`, `event(id, eventType, eventDate, animalId, farmId, batchOperationId, createdBy, createdAt, voidsEventId)` with a check constraint restricting `eventType` to `'transfer' | 'health' | 'retag' | 'recategorize' | 'sale' | 'death' | 'void'` and a check constraint enforcing `voidsEventId` is set if and only if `eventType = 'void'`.
- Consumes: `farm`, `userAccount` (existing), `animal` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/schema/event-core.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmAndUser() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { seededFarm, user };
}

describe("batch_operation table", () => {
  it("stores a batch operation tied to a farm and a creator", async () => {
    const { seededFarm, user } = await seedFarmAndUser();
    const [created] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    expect(created.animalCount).toBe(1);
    expect(created.selectionCriteria).toEqual({});
  });
});

describe("event table", () => {
  it("stores an event and enforces the event_type check constraint", async () => {
    const { seededFarm, user } = await seedFarmAndUser();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();

    const [created] = await testDb
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
    expect(created.eventType).toBe("transfer");
    expect(created.voidsEventId).toBeNull();

    await expect(
      testDb.insert(event).values({
        eventType: "not-a-real-type",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
    ).rejects.toThrow();
  });

  it("enforces voidsEventId is set only when eventType is void", async () => {
    const { seededFarm, user } = await seedFarmAndUser();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();

    // event_type = 'void' without voidsEventId must fail
    await expect(
      testDb.insert(event).values({
        eventType: "void",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
    ).rejects.toThrow();

    // event_type <> 'void' with voidsEventId set must fail
    const [firstEvent] = await testDb
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

    await expect(
      testDb.insert(event).values({
        eventType: "transfer",
        eventDate: "2026-01-02",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: batch.id,
        createdBy: user.id,
        voidsEventId: firstEvent.id,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- event-core.test.ts
```

Expected: FAIL — `batchOperation`/`event` not exported from `@/db/schema`.

- [ ] **Step 3: Write the schema file**

Create `web/db/schema/event.ts`:

```typescript
import { pgTable, uuid, text, integer, jsonb, timestamp, date, index, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { farm } from "./farm";
import { userAccount } from "./user";
import { animal } from "./animal";

export const batchOperation = pgTable("batch_operation", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farm.id),
  selectionCriteria: jsonb("selection_criteria").notNull().default({}),
  animalCount: integer("animal_count").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => userAccount.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    eventDate: date("event_date").notNull(),
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animal.id),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id),
    batchOperationId: uuid("batch_operation_id")
      .notNull()
      .references(() => batchOperation.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidsEventId: uuid("voids_event_id").references((): AnyPgColumn => event.id),
  },
  (table) => [
    index("event_animal_id_idx").on(table.animalId),
    index("event_batch_operation_id_idx").on(table.batchOperationId),
    check(
      "event_type_check",
      sql`${table.eventType} in ('transfer', 'health', 'retag', 'recategorize', 'sale', 'death', 'void')`
    ),
    check(
      "event_voids_only_when_void",
      sql`(${table.eventType} = 'void' and ${table.voidsEventId} is not null) or (${table.eventType} <> 'void' and ${table.voidsEventId} is null)`
    ),
  ]
);
```

Modify `web/db/schema/index.ts` (add one line):

```typescript
export * from "./event";
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd web && npm run db:generate
npm run db:migrate:test
npm run db:migrate
```

Expected: new migration file with `CREATE TABLE "batch_operation"`, `CREATE TABLE "event"` (including both `CONSTRAINT ... CHECK (...)` clauses and the self-referencing FK on `voids_event_id`); both migrate commands succeed.

- [ ] **Step 5: Extend the test-db reset helper**

Modify `web/test/reset-db.ts` — add at the top (children of everything else, truncate first):

```typescript
  await testDb.execute(sql`TRUNCATE TABLE event CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE batch_operation CASCADE`);
```

(Full order now: `event`, `batch_operation`, `animal_tag_history`, `animal`, `user_farm`, `user_account`, `farm`, `role`, `category`, `product`.)

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test -- event-core.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add db/schema/event.ts db/schema/index.ts drizzle/ test/reset-db.ts __tests__/schema/event-core.test.ts
git commit -m "feat: add batch_operation and event core tables"
```

---

## Task 4: Event child tables

**Files:**
- Create: `web/db/schema/event-children.ts`
- Modify: `web/db/schema/index.ts`
- Modify: `web/test/reset-db.ts`
- Create: `web/__tests__/schema/event-children.test.ts`

**Interfaces:**
- Produces (all with `eventId uuid primary key references event.id on delete cascade`):
  - `eventTransfer(eventId, originFarmId, destinationFarmId, guideNumber)`
  - `eventHealth(eventId, productId, dose, doseUnit, route, withdrawalDays, notes)`
  - `eventRetag(eventId, oldTag, newTag)`
  - `eventRecategorize(eventId, oldCategoryId, newCategoryId)`
  - `eventSale(eventId, buyer, price, weightKg)`
  - `eventDeath(eventId, cause)`
- Consumes: `event` (Task 3), `farm` (existing), `product`, `category` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/schema/event-children.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  animal,
  batchOperation,
  event,
  category,
  product,
  eventTransfer,
  eventHealth,
  eventRetag,
  eventRecategorize,
  eventSale,
  eventDeath,
} from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function seedEvent(eventType: string) {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType, farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
    .returning();
  const [createdEvent] = await testDb
    .insert(event)
    .values({
      eventType,
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      farmId: seededFarm.id,
      batchOperationId: batch.id,
      createdBy: user.id,
    })
    .returning();
  return { seededFarm, createdEvent };
}

describe("event_transfer table", () => {
  it("stores origin/destination farms with an optional guide number", async () => {
    const { seededFarm, createdEvent } = await seedEvent("transfer");
    const [row] = await testDb
      .insert(eventTransfer)
      .values({ eventId: createdEvent.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id })
      .returning();
    expect(row.guideNumber).toBeNull();
  });
});

describe("event_health table", () => {
  it("stores dose/route with a required product and dose", async () => {
    const { createdEvent } = await seedEvent("health");
    const [createdProduct] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [row] = await testDb
      .insert(eventHealth)
      .values({ eventId: createdEvent.id, productId: createdProduct.id, dose: "10", doseUnit: "ml", route: "subcutánea" })
      .returning();
    expect(row.dose).toBe("10");
    expect(row.withdrawalDays).toBeNull();
  });
});

describe("event_retag table", () => {
  it("requires old and new tags", async () => {
    const { createdEvent } = await seedEvent("retag");
    const [row] = await testDb
      .insert(eventRetag)
      .values({ eventId: createdEvent.id, oldTag: "AR000000000001", newTag: "AR000000000002" })
      .returning();
    expect(row.newTag).toBe("AR000000000002");
  });
});

describe("event_recategorize table", () => {
  it("links old and new categories", async () => {
    const { createdEvent } = await seedEvent("recategorize");
    const [oldCategory] = await testDb.insert(category).values({ name: "Ternero" }).returning();
    const [newCategory] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [row] = await testDb
      .insert(eventRecategorize)
      .values({ eventId: createdEvent.id, oldCategoryId: oldCategory.id, newCategoryId: newCategory.id })
      .returning();
    expect(row.newCategoryId).toBe(newCategory.id);
  });
});

describe("event_sale table", () => {
  it("stores optional buyer/price/weight", async () => {
    const { createdEvent } = await seedEvent("sale");
    const [row] = await testDb.insert(eventSale).values({ eventId: createdEvent.id }).returning();
    expect(row.buyer).toBeNull();
    expect(row.price).toBeNull();
    expect(row.weightKg).toBeNull();
  });
});

describe("event_death table", () => {
  it("stores an optional cause", async () => {
    const { createdEvent } = await seedEvent("death");
    const [row] = await testDb.insert(eventDeath).values({ eventId: createdEvent.id }).returning();
    expect(row.cause).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- event-children.test.ts
```

Expected: FAIL — `eventTransfer`/`eventHealth`/etc. not exported from `@/db/schema`.

- [ ] **Step 3: Write the schema file**

Create `web/db/schema/event-children.ts`:

```typescript
import { pgTable, uuid, text, numeric, integer } from "drizzle-orm/pg-core";
import { event } from "./event";
import { farm } from "./farm";
import { product } from "./product";
import { category } from "./category";

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
});

export const eventHealth = pgTable("event_health", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => product.id),
  dose: numeric("dose").notNull(),
  doseUnit: text("dose_unit").notNull(),
  route: text("route").notNull(),
  withdrawalDays: integer("withdrawal_days"),
  notes: text("notes"),
});

export const eventRetag = pgTable("event_retag", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  oldTag: text("old_tag").notNull(),
  newTag: text("new_tag").notNull(),
});

export const eventRecategorize = pgTable("event_recategorize", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  oldCategoryId: uuid("old_category_id")
    .notNull()
    .references(() => category.id),
  newCategoryId: uuid("new_category_id")
    .notNull()
    .references(() => category.id),
});

export const eventSale = pgTable("event_sale", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  buyer: text("buyer"),
  price: numeric("price"),
  weightKg: numeric("weight_kg"),
});

export const eventDeath = pgTable("event_death", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  cause: text("cause"),
});
```

Modify `web/db/schema/index.ts` (add one line):

```typescript
export * from "./event-children";
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd web && npm run db:generate
npm run db:migrate:test
npm run db:migrate
```

Expected: new migration file with all six `CREATE TABLE` statements and their FKs; both migrate commands succeed.

- [ ] **Step 5: Extend the test-db reset helper**

Modify `web/test/reset-db.ts` — add the six child tables before the `event`/`batch_operation` truncates (children of `event` must go first):

```typescript
  await testDb.execute(sql`TRUNCATE TABLE event_transfer CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_health CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_retag CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_recategorize CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_sale CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_death CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE batch_operation CASCADE`);
```

(Full order now: the six `event_*` children, `event`, `batch_operation`, `animal_tag_history`, `animal`, `user_farm`, `user_account`, `farm`, `role`, `category`, `product`.)

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test -- event-children.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add db/schema/event-children.ts db/schema/index.ts drizzle/ test/reset-db.ts __tests__/schema/event-children.test.ts
git commit -m "feat: add event child tables (transfer, health, retag, recategorize, sale, death)"
```

---

## Task 5: Derived state — `animal_current_state`

**Files:**
- Create: `web/drizzle/<NNNN>_create_derived_state.sql` (hand-written, via `drizzle-kit generate --custom`)
- Create: `web/__tests__/derived-state.test.ts`

**Interfaces:**
- Produces: materialized view `animal_current_state(animal_id, current_tag, current_farm_id, current_category_id, status)` plus a unique index on `animal_id`, a `security definer`-equivalent-not-needed refresh function `refresh_animal_current_state()` (no `security definer` needed — there's no per-role privilege split to work around, unlike the old Supabase version), and one `AFTER INSERT ... FOR EACH STATEMENT` trigger per source table (`event` and all six `event_*` children — a trigger on `event` alone would refresh before that same statement's follow-up insert into e.g. `event_transfer` has landed).
- Not modeled in Drizzle's schema DSL at all (materialized views aren't representable there) — queried only via raw `sql` in the DAL (Task 6) and in this task's test.
- Consumes: `event` + all six `event_*` children (Tasks 3, 4).
- No RLS, no wrapper view — this is a plain materialized view queryable directly, since Postgres local has no per-role RLS split to work around (unlike the discarded Supabase version, which needed a `_mv`-suffixed view plus a security-invoker wrapper).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/derived-state.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../test/db";
import { resetTestDb } from "../test/reset-db";
import { role, farm, userAccount, animal, batchOperation, event, eventTransfer } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

async function currentFarmIdFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_farm_id: string | null }>(
    sql`select current_farm_id from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.current_farm_id ?? null;
}

describe("animal_current_state", () => {
  it("reflects the transfer destination farm after insert, and excludes voided transfers", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [farmSur] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();

    const [batch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: farmNorte.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: farmNorte.id,
        batchOperationId: batch.id,
        createdBy: user.id,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: transferEvent.id, originFarmId: farmNorte.id, destinationFarmId: farmSur.id });

    expect(await currentFarmIdFor(createdAnimal.id)).toBe(farmSur.id);

    // Void the transfer and confirm the animal falls back to "no current farm".
    const [voidBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "void", farmId: farmNorte.id, animalCount: 1, createdBy: user.id })
      .returning();
    await testDb.insert(event).values({
      eventType: "void",
      eventDate: "2026-01-02",
      animalId: createdAnimal.id,
      farmId: farmNorte.id,
      batchOperationId: voidBatch.id,
      createdBy: user.id,
      voidsEventId: transferEvent.id,
    });

    expect(await currentFarmIdFor(createdAnimal.id)).toBeNull();

    const remainingTransferEvents = await testDb.execute(
      sql`select count(*) as count from event where event_type = 'transfer'`
    );
    expect(Number(remainingTransferEvents.rows[0].count)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- derived-state.test.ts
```

Expected: FAIL — `relation "animal_current_state" does not exist`.

- [ ] **Step 3: Generate an empty custom migration**

```bash
cd web && npx drizzle-kit generate --custom --name=create_derived_state
```

Expected: creates an empty `web/drizzle/<NNNN>_create_derived_state.sql` and adds an entry to `web/drizzle/meta/_journal.json`.

- [ ] **Step 4: Write the migration SQL**

Edit the generated file:

```sql
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
  select distinct on (ae.animal_id) ae.animal_id, t.destination_farm_id
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

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test -- derived-state.test.ts
```

Expected: PASS, 1 test (3 assertions).

- [ ] **Step 7: Commit**

```bash
git add drizzle/ __tests__/derived-state.test.ts
git commit -m "feat: add animal_current_state derived-state materialized view with auto-refresh trigger"
```

---

## Task 6: DAL authorization for the event domain

**Files:**
- Create: `web/lib/dal/animal-access.ts`
- Create: `web/__tests__/dal/animal-access.test.ts`

**Interfaces:**
- Produces:
  - `requireTransferAuthorization(role: string | undefined, originFarmId: string, destinationFarmId: string): void` — throws unless `originFarmId === destinationFarmId` or `isAdmin(role)`.
  - `visibleCurrentState(userId: string, role: string | undefined): Promise<Array<{ animalId: string; currentTag: string | null; currentFarmId: string | null; currentCategoryId: string | null; status: string }>>` — returns every row of `animal_current_state` for admins, or only rows whose `current_farm_id` is one of the caller's farms (via `userFarmIds`) for everyone else; returns `[]` for a non-admin with no assigned farms (no query needed).
- Consumes: `isAdmin`, `userFarmIds` (`web/lib/dal/farm-access.ts`, existing), `db` (`web/db`, existing), `animal_current_state` (Task 5, queried via raw `sql`, no Drizzle schema object exists for it).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/dal/animal-access.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, animal, batchOperation, event, eventTransfer } from "@/db/schema";
import { requireTransferAuthorization, visibleCurrentState } from "@/lib/dal/animal-access";

beforeEach(async () => {
  await resetTestDb();
});

describe("requireTransferAuthorization", () => {
  it("allows a same-farm transfer for a manager", () => {
    expect(() => requireTransferAuthorization("manager", "farm-a", "farm-a")).not.toThrow();
  });

  it("rejects a cross-farm transfer for a manager", () => {
    expect(() => requireTransferAuthorization("manager", "farm-a", "farm-b")).toThrow();
  });

  it("allows a cross-farm transfer for an admin", () => {
    expect(() => requireTransferAuthorization("admin", "farm-a", "farm-b")).not.toThrow();
  });
});

describe("visibleCurrentState", () => {
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

    for (const [targetFarm] of [[farmNorte], [farmSur]] as const) {
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

  it("scopes results to the manager's assigned farm", async () => {
    const { manager, farmNorte } = await seedTwoFarmsWithOneAnimalEach();
    const rows = await visibleCurrentState(manager.id, "manager");
    expect(rows).toHaveLength(1);
    expect(rows[0].currentFarmId).toBe(farmNorte.id);
  });

  it("returns every farm's animals for an admin", async () => {
    const { admin } = await seedTwoFarmsWithOneAnimalEach();
    const rows = await visibleCurrentState(admin.id, "admin");
    expect(rows).toHaveLength(2);
  });

  it("returns an empty array for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [unassignedManager] = await testDb
      .insert(userAccount)
      .values({ name: "Sin campo", email: "sincampo@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    const rows = await visibleCurrentState(unassignedManager.id, "manager");
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- animal-access.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dal/animal-access'`.

- [ ] **Step 3: Write the DAL module**

Create `web/lib/dal/animal-access.ts`:

```typescript
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

export function requireTransferAuthorization(
  role: string | undefined,
  originFarmId: string,
  destinationFarmId: string
): void {
  if (originFarmId === destinationFarmId) return;
  if (!isAdmin(role)) {
    throw new Error("Solo un admin puede crear un traslado entre campos distintos");
  }
}

export type AnimalCurrentState = {
  animalId: string;
  currentTag: string | null;
  currentFarmId: string | null;
  currentCategoryId: string | null;
  status: string;
};

type CurrentStateRow = {
  animal_id: string;
  current_tag: string | null;
  current_farm_id: string | null;
  current_category_id: string | null;
  status: string;
};

function toAnimalCurrentState(row: CurrentStateRow): AnimalCurrentState {
  return {
    animalId: row.animal_id,
    currentTag: row.current_tag,
    currentFarmId: row.current_farm_id,
    currentCategoryId: row.current_category_id,
    status: row.status,
  };
}

export async function visibleCurrentState(userId: string, role: string | undefined): Promise<AnimalCurrentState[]> {
  if (isAdmin(role)) {
    const result = await db.execute<CurrentStateRow>(sql`select * from animal_current_state`);
    return result.rows.map(toAnimalCurrentState);
  }

  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];

  const result = await db.execute<CurrentStateRow>(
    sql`select * from animal_current_state where current_farm_id = any(${farmIds})`
  );
  return result.rows.map(toAnimalCurrentState);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- animal-access.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npm run test
```

Expected: PASS, all files (existing auth-shell tests + every test added in Tasks 1–6).

- [ ] **Step 6: Commit**

```bash
git add lib/dal/animal-access.ts __tests__/dal/animal-access.test.ts
git commit -m "feat: add DAL authorization for the animal/event domain (transfer authorization, farm-scoped current state)"
```

---

## Post-plan note

This plan ports the schema prerequisite for "carga de caravanas y actividades" (`docs/superpowers/specs/2026-07-20-activity-loading-design.md`) to Drizzle/Postgres local. It does **not** implement: paddocks (the other prerequisite — `docs/superpowers/specs/2026-07-20-paddocks-schema-design.md`, also needs a from-Supabase adaptation pass before it can be planned), the batch-operation orchestration Server Actions, Excel import/validation, or any UI. Those are separate plans, to continue once paddocks is ported.
