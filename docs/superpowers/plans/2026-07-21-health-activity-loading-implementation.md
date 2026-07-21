# Health (Sanidad) Activity Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end "sanidad" (health) activity-loading flow — upload an Excel of tags, map its columns (reusing the memory from traslado), add one or more products with dose/route/carencia, and confirm a batch where every animal gets one health event per product — as described in [`docs/superpowers/specs/2026-07-21-health-activity-loading-design.md`](../specs/2026-07-21-health-activity-loading-design.md).

**Architecture:** Tasks 1–2 are a pure refactor of the already-merged transfer activity: `resolveBatchRows`/`ResolvedRow` move from `lib/activities/transfer.ts` to a shared `lib/activities/batch-resolution.ts`, and the new-animal creation logic (animal + tag history + self-retag + self-recategorize) moves to a shared `lib/activities/animal-creation.ts`. `confirmTransferBatch` is refactored to consume both without any behavior change — its existing tests must still pass unmodified in assertions, only import paths change. Tasks 3–7 build sanidad on top of that shared base, mirroring the transfer activity's Server Action / UI structure exactly.

**Tech Stack:** Same as the transfer activity — Drizzle, Next.js Server Actions, Vitest, Playwright. No new dependencies.

## Global Constraints

- All UI copy in Spanish.
- The uploaded Excel is never persisted, same as transfer.
- `confirmHealthBatch` rejects the whole batch if any row has `status: "error"`, or if the product list is empty — no partial application.
- `confirmHealthBatch` only calls `requireFarmAccess` — sanidad never crosses farms, so `requireTransferAuthorization` does not apply here.
- A new animal in a health batch gets exactly one internal placement transfer (origin = destination = `operatingFarmId`, no paddock) in addition to its health events; an existing animal never gets this placement event.
- Every animal in the batch (existing or new) gets exactly one `event`+`event_health` row per product in the list — same dose/unit/route/withdrawalDays/notes for the whole batch, no per-row variation.
- After Task 2's refactor, run the full existing test suite (`npm run test`) to confirm zero regressions before moving on — this is the regression gate for touching already-shipped transfer code.

---

## Task 1: Extract `resolveBatchRows` to a shared module

**Files:**
- Create: `web/lib/activities/batch-resolution.ts`
- Modify: `web/lib/activities/transfer.ts`
- Modify: `web/__tests__/lib/activities/transfer-resolve.test.ts` → rename to `web/__tests__/lib/activities/batch-resolution.test.ts`

**Interfaces:**
- Produces (moved as-is, same signatures): `ResolvedRow` type, `resolveBatchRows(rows: MappedRow[], formEventDate: string): Promise<ResolvedRow[]>`, both exported from `@/lib/activities/batch-resolution`.
- `transfer.ts` re-exports nothing new here — it will import `ResolvedRow`/`resolveBatchRows` from the new module in Task 2 (kept as two small steps so each has its own passing test checkpoint).

- [ ] **Step 1: Move the resolution code verbatim**

Create `web/lib/activities/batch-resolution.ts` with the exact content of the resolution half of the current `web/lib/activities/transfer.ts` (everything from the top imports through the end of `resolveBatchRows` — not `confirmTransferBatch`):

```typescript
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, category } from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";

export type ResolvedRow = { tag: string; eventDate: string } & (
  | { status: "existing"; animalId: string; currentFarmId: string | null; currentPaddockId: string | null }
  | { status: "new"; categoryId: string | null }
  | { status: "error"; reason: string }
);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveEventDate(rowDate: string | null, formEventDate: string): string {
  return rowDate && ISO_DATE.test(rowDate) ? rowDate : formEventDate;
}

type CurrentStateRow = { current_farm_id: string | null; current_paddock_id: string | null; status: string };

export async function resolveBatchRows(rows: MappedRow[], formEventDate: string): Promise<ResolvedRow[]> {
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
  }

  const nonEmptyTags = rows.map((r) => r.tag).filter((tag) => tag.length > 0);
  const tagHistoryRows =
    nonEmptyTags.length > 0
      ? await db
          .select({ tag: animalTagHistory.tag, animalId: animalTagHistory.animalId })
          .from(animalTagHistory)
          .where(inArray(animalTagHistory.tag, nonEmptyTags))
      : [];
  const animalIdByTag = new Map(tagHistoryRows.map((r) => [r.tag, r.animalId]));

  const categoryRows = await db.select({ id: category.id, name: category.name }).from(category);
  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

  const result: ResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);

    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }

    const animalId = animalIdByTag.get(row.tag);
    if (animalId) {
      const stateResult = await db.execute<CurrentStateRow>(
        sql`select current_farm_id, current_paddock_id, status from animal_current_state where animal_id = ${animalId}`
      );
      const state = stateResult.rows[0];
      if (state && state.status !== "alive") {
        result.push({ tag: row.tag, eventDate, status: "error", reason: "El animal está vendido o muerto" });
        continue;
      }
      result.push({
        tag: row.tag,
        eventDate,
        status: "existing",
        animalId,
        currentFarmId: state?.current_farm_id ?? null,
        currentPaddockId: state?.current_paddock_id ?? null,
      });
      continue;
    }

    if (row.category) {
      const categoryId = categoryIdByName.get(row.category);
      if (!categoryId) {
        result.push({ tag: row.tag, eventDate, status: "error", reason: "Categoría no reconocida" });
        continue;
      }
      result.push({ tag: row.tag, eventDate, status: "new", categoryId });
      continue;
    }

    result.push({ tag: row.tag, eventDate, status: "new", categoryId: null });
  }

  return result;
}
```

- [ ] **Step 2: Rename and repoint the resolution test file**

```bash
cd web && git mv __tests__/lib/activities/transfer-resolve.test.ts __tests__/lib/activities/batch-resolution.test.ts
```

Edit `web/__tests__/lib/activities/batch-resolution.test.ts` — change only the import path (everything else in the file is unchanged):

```typescript
const { resolveBatchRows } = await import("@/lib/activities/batch-resolution");
```

- [ ] **Step 3: Run the moved test and confirm it still passes**

```bash
npm run test -- batch-resolution.test.ts
```

Expected: PASS, 7 tests (same count as before the move).

- [ ] **Step 4: Remove the now-duplicated code from `transfer.ts` and import from the new module**

Modify `web/lib/activities/transfer.ts` — replace everything from the top imports through the end of `resolveBatchRows` (i.e. everything Step 1 copied out) with:

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventRetag,
  eventRecategorize,
  paddock,
} from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { requireTransferAuthorization } from "@/lib/dal/animal-access";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";

export { resolveBatchRows, type ResolvedRow };
```

(The re-export keeps `web/app/(protected)/activities/transfer/actions.ts`'s existing `import { resolveBatchRows, confirmTransferBatch, type ResolvedRow } from "@/lib/activities/transfer"` working without any change to that file — this task is a pure internal refactor, no consumer-facing import changes.)

- [ ] **Step 5: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file — in particular `transfer-confirm.test.ts` and `transfer-actions.test.ts`, which exercise `confirmTransferBatch` and the Server Actions that still import from `transfer.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/activities/batch-resolution.ts lib/activities/transfer.ts __tests__/lib/activities/batch-resolution.test.ts
git commit -m "refactor: extract resolveBatchRows into a shared batch-resolution module"
```

---

## Task 2: Extract new-animal creation to a shared module

**Files:**
- Create: `web/lib/activities/animal-creation.ts`
- Modify: `web/lib/activities/transfer.ts`
- Create: `web/__tests__/lib/activities/animal-creation.test.ts`

**Interfaces:**
- Produces: `createNewAnimal(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], input: { userId: string; operatingFarmId: string; batchId: string; row: Extract<ResolvedRow, { status: "new" }> }): Promise<string>` — inserts `animal`, `animal_tag_history`, a self-`retag` event (`old_tag = new_tag = row.tag`), and — only if `row.categoryId` is set — a self-`recategorize` event (`old_category_id = new_category_id = row.categoryId`). Returns the new animal's id. Exported from `@/lib/activities/animal-creation`.
- Consumes: `animal`, `animalTagHistory`, `event`, `eventRetag`, `eventRecategorize` (`@/db/schema`), `ResolvedRow` (`@/lib/activities/batch-resolution`, Task 1).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/lib/activities/animal-creation.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, category, batchOperation, event, eventRetag, eventRecategorize, animalTagHistory } from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { createNewAnimal } = await import("@/lib/activities/animal-creation");

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
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "health", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
    .returning();
  return { seededFarm, user, batch };
}

describe("createNewAnimal", () => {
  it("creates the animal, its tag history, and a self-retag event", async () => {
    const { seededFarm, user, batch } = await seedFarmAndUser();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000060",
      eventDate: "2026-02-01",
      status: "new",
      categoryId: null,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, { userId: user.id, operatingFarmId: seededFarm.id, batchId: batch.id, row })
    );

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.animalId, animalId));
    expect(tagRow.tag).toBe("AR000000000060");

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("retag");

    const [retag] = await testDb.select().from(eventRetag).where(eq(eventRetag.eventId, events[0].id));
    expect(retag.oldTag).toBe("AR000000000060");
    expect(retag.newTag).toBe("AR000000000060");
  });

  it("also creates a self-recategorize event when the row carries a category", async () => {
    const { seededFarm, user, batch } = await seedFarmAndUser();
    const [createdCategory] = await testDb.insert(category).values({ name: "Ternero" }).returning();
    const row: Extract<ResolvedRow, { status: "new" }> = {
      tag: "AR000000000061",
      eventDate: "2026-02-01",
      status: "new",
      categoryId: createdCategory.id,
    };

    const animalId = await testDb.transaction(async (tx) =>
      createNewAnimal(tx, { userId: user.id, operatingFarmId: seededFarm.id, batchId: batch.id, row })
    );

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events.map((e) => e.eventType).sort()).toEqual(["recategorize", "retag"]);

    const recategorizeEvent = events.find((e) => e.eventType === "recategorize")!;
    const [recategorize] = await testDb
      .select()
      .from(eventRecategorize)
      .where(eq(eventRecategorize.eventId, recategorizeEvent.id));
    expect(recategorize.newCategoryId).toBe(createdCategory.id);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- animal-creation.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/activities/animal-creation'`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/activities/animal-creation.ts`:

```typescript
import { animal, animalTagHistory, event, eventRetag, eventRecategorize } from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";
import type { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createNewAnimal(
  tx: Transaction,
  input: {
    userId: string;
    operatingFarmId: string;
    batchId: string;
    row: Extract<ResolvedRow, { status: "new" }>;
  }
): Promise<string> {
  const { userId, operatingFarmId, batchId, row } = input;

  const [createdAnimal] = await tx.insert(animal).values({}).returning();
  await tx.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: row.tag });

  // Self-retag: establishes the new animal's current_tag in the derived
  // state view, which only reflects the *last event_retag*, not
  // animal_tag_history directly.
  const [retagEvent] = await tx
    .insert(event)
    .values({
      eventType: "retag",
      eventDate: row.eventDate,
      animalId: createdAnimal.id,
      farmId: operatingFarmId,
      batchOperationId: batchId,
      createdBy: userId,
    })
    .returning();
  await tx.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: row.tag, newTag: row.tag });

  // Self-recategorize: only when the row carried an initial category — an
  // animal with none stays uncategorized until a real recategorize event is
  // loaded later.
  if (row.categoryId) {
    const [recategorizeEvent] = await tx
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: row.eventDate,
        animalId: createdAnimal.id,
        farmId: operatingFarmId,
        batchOperationId: batchId,
        createdBy: userId,
      })
      .returning();
    await tx
      .insert(eventRecategorize)
      .values({ eventId: recategorizeEvent.id, oldCategoryId: row.categoryId, newCategoryId: row.categoryId });
  }

  return createdAnimal.id;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- animal-creation.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Refactor `confirmTransferBatch` to use the shared helper**

Modify `web/lib/activities/transfer.ts` — add the import and replace the inline new-animal block:

```typescript
import { createNewAnimal } from "@/lib/activities/animal-creation";
```

Replace the `else` branch inside `confirmTransferBatch`'s loop (everything from `const [createdAnimal] = await tx.insert(animal)...` through the closing of the `if (row.categoryId) { ... }` block) with:

```typescript
      } else {
        animalId = await createNewAnimal(tx, {
          userId,
          operatingFarmId,
          batchId: batch.id,
          row,
        });
        originFarmId = operatingFarmId;
        originPaddockId = null;
      }
```

(`animal`, `eventRetag`, `eventRecategorize` are no longer used directly in `transfer.ts` after this — remove them from its import list, keeping `animalTagHistory` only if still referenced elsewhere in the file; if not, remove it too. `batchOperation`, `event`, `eventTransfer`, `paddock`, `eq` remain in use.)

- [ ] **Step 6: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file — `transfer-confirm.test.ts`'s existing assertions (self-retag/recategorize behavior, event counts) must still pass unchanged, now exercising the shared helper instead of inline code.

- [ ] **Step 7: Commit**

```bash
git add lib/activities/animal-creation.ts lib/activities/transfer.ts __tests__/lib/activities/animal-creation.test.ts
git commit -m "refactor: extract new-animal creation into a shared animal-creation module"
```

---

## Task 3: `listProducts` catalog query

**Files:**
- Create: `web/lib/dal/product-catalog.ts`
- Create: `web/__tests__/dal/product-catalog.test.ts`

**Interfaces:**
- Produces: `listProducts(): Promise<{ id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }[]>`, ordered by `name`.
- Consumes: `db` (`@/db`), `product` (`@/db/schema`).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/dal/product-catalog.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listProducts } = await import("@/lib/dal/product-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listProducts", () => {
  it("lists every product ordered by name, with defaults", async () => {
    await testDb.insert(product).values([
      { name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
      { name: "Aftosa" },
    ]);

    const products = await listProducts();

    expect(products).toEqual([
      { id: expect.any(String), name: "Aftosa", defaultDoseUnit: null, defaultWithdrawalDays: null },
      { id: expect.any(String), name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- product-catalog.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dal/product-catalog'`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/dal/product-catalog.ts`:

```typescript
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { product } from "@/db/schema";

export type ProductCatalogEntry = {
  id: string;
  name: string;
  defaultDoseUnit: string | null;
  defaultWithdrawalDays: number | null;
};

export async function listProducts(): Promise<ProductCatalogEntry[]> {
  return db
    .select({
      id: product.id,
      name: product.name,
      defaultDoseUnit: product.defaultDoseUnit,
      defaultWithdrawalDays: product.defaultWithdrawalDays,
    })
    .from(product)
    .orderBy(asc(product.name));
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- product-catalog.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add lib/dal/product-catalog.ts __tests__/dal/product-catalog.test.ts
git commit -m "feat: add listProducts catalog query"
```

---

## Task 4: `confirmHealthBatch`

**Files:**
- Create: `web/lib/activities/health.ts`
- Create: `web/__tests__/lib/activities/health-confirm.test.ts`

**Interfaces:**
- Produces:
  - `type HealthProduct = { productId: string; dose: string; doseUnit: string; route: string; withdrawalDays: number | null; notes: string | null }`
  - `confirmHealthBatch(input: { userId: string; role: string | undefined; operatingFarmId: string; products: HealthProduct[]; rows: ResolvedRow[] }): Promise<void>` — throws if any row has `status: "error"`, if `products` is empty, or if the caller lacks access to `operatingFarmId`. Otherwise, in one transaction: one `batch_operation` (`event_type='health'`); for `"new"` rows, `createNewAnimal` + one internal placement `event`+`event_transfer` (origin = destination = `operatingFarmId`, no paddock); then, for **every** row (existing or new), one `event`+`event_health` per entry in `products`.
- Consumes: `requireFarmAccess` (`@/lib/dal/farm-access`), `createNewAnimal` (`@/lib/activities/animal-creation`, Task 2), `ResolvedRow` (`@/lib/activities/batch-resolution`, Task 1), `batchOperation`, `event`, `eventTransfer`, `eventHealth` (`@/db/schema`).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/lib/activities/health-confirm.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  userFarm,
  product,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventHealth,
} from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";
import type { HealthProduct } from "@/lib/activities/health";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmHealthBatch } = await import("@/lib/activities/health");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });
  return { manager, seededFarm };
}

describe("confirmHealthBatch", () => {
  it("creates one health event per product for a new animal, plus one placement transfer", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [productB] = await testDb.insert(product).values({ name: "Aftosa" }).returning();

    const rows: ResolvedRow[] = [{ tag: "AR000000000070", eventDate: "2026-02-01", status: "new", categoryId: null }];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: 21, notes: null },
      { productId: productB.id, dose: "2", doseUnit: "ml", route: "intramuscular", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows });

    const [tagRow] = await testDb.select().from(animalTagHistory).where(eq(animalTagHistory.tag, "AR000000000070"));
    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, tagRow.animalId));

    expect(animalEvents.filter((e) => e.eventType === "health")).toHaveLength(2);
    expect(animalEvents.filter((e) => e.eventType === "transfer")).toHaveLength(1);
    expect(animalEvents.filter((e) => e.eventType === "retag")).toHaveLength(1);

    const transferEvent = animalEvents.find((e) => e.eventType === "transfer")!;
    const [transfer] = await testDb.select().from(eventTransfer).where(eq(eventTransfer.eventId, transferEvent.id));
    expect(transfer.originFarmId).toBe(seededFarm.id);
    expect(transfer.destinationFarmId).toBe(seededFarm.id);
    expect(transfer.destinationPaddockId).toBeNull();

    const healthEvents = animalEvents.filter((e) => e.eventType === "health");
    const healthRows = await Promise.all(
      healthEvents.map(async (e) => {
        const [row] = await testDb.select().from(eventHealth).where(eq(eventHealth.eventId, e.id));
        return row;
      })
    );
    expect(healthRows.map((r) => r.productId).sort()).toEqual([productA.id, productB.id].sort());
  });

  it("does not create a placement transfer for an existing animal", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000071" });

    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000071",
        eventDate: "2026-02-01",
        status: "existing",
        animalId: createdAnimal.id,
        currentFarmId: seededFarm.id,
        currentPaddockId: null,
      },
    ];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows });

    const animalEvents = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.id));
    expect(animalEvents).toHaveLength(1);
    expect(animalEvents[0].eventType).toBe("health");
  });

  it("rejects an empty product list", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [{ tag: "AR000000000072", eventDate: "2026-02-01", status: "new", categoryId: null }];

    await expect(
      confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products: [], rows })
    ).rejects.toThrow();
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();
    const rows: ResolvedRow[] = [{ tag: "AR000000000073", eventDate: "2026-02-01", status: "error", reason: "x" }];
    const products: HealthProduct[] = [
      { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
    ];

    await expect(
      confirmHealthBatch({ userId: manager.id, role: "manager", operatingFarmId: seededFarm.id, products, rows })
    ).rejects.toThrow();

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- health-confirm.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/activities/health'`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/activities/health.ts`:

```typescript
import { batchOperation, event, eventTransfer, eventHealth } from "@/db/schema";
import { db } from "@/db";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { createNewAnimal } from "@/lib/activities/animal-creation";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

export type HealthProduct = {
  productId: string;
  dose: string;
  doseUnit: string;
  route: string;
  withdrawalDays: number | null;
  notes: string | null;
};

export async function confirmHealthBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  products: HealthProduct[];
  rows: ResolvedRow[];
}): Promise<void> {
  const { userId, role, operatingFarmId, products, rows } = input;

  await requireFarmAccess(userId, role, operatingFarmId);

  if (products.length === 0) {
    throw new Error("Hay que elegir al menos un producto");
  }
  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "health", farmId: operatingFarmId, animalCount: rows.length, createdBy: userId })
      .returning();

    for (const row of rows) {
      if (row.status === "error") continue;

      let animalId: string;

      if (row.status === "existing") {
        animalId = row.animalId;
      } else {
        animalId = await createNewAnimal(tx, { userId, operatingFarmId, batchId: batch.id, row });

        // Sanidad doesn't relocate animals, but a brand-new one still needs a
        // transfer event to be visible in animal_current_state (which only
        // derives current_farm_id from event_transfer) — this places it at
        // the farm it was loaded from, origin = destination.
        const [placementEvent] = await tx
          .insert(event)
          .values({
            eventType: "transfer",
            eventDate: row.eventDate,
            animalId,
            farmId: operatingFarmId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventTransfer).values({
          eventId: placementEvent.id,
          originFarmId: operatingFarmId,
          destinationFarmId: operatingFarmId,
          originPaddockId: null,
          destinationPaddockId: null,
        });
      }

      for (const healthProduct of products) {
        const [healthEvent] = await tx
          .insert(event)
          .values({
            eventType: "health",
            eventDate: row.eventDate,
            animalId,
            farmId: operatingFarmId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();

        await tx.insert(eventHealth).values({
          eventId: healthEvent.id,
          productId: healthProduct.productId,
          dose: healthProduct.dose,
          doseUnit: healthProduct.doseUnit,
          route: healthProduct.route,
          withdrawalDays: healthProduct.withdrawalDays,
          notes: healthProduct.notes,
        });
      }
    }
  });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- health-confirm.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/activities/health.ts __tests__/lib/activities/health-confirm.test.ts
git commit -m "feat: add confirmHealthBatch (multi-product health events + new-animal placement)"
```

---

## Task 5: Server Actions

**Files:**
- Create: `web/app/(protected)/activities/health/actions.ts`
- Create: `web/__tests__/activities/health-actions.test.ts`

**Interfaces:**
- Produces:
  - `previewHealthBatch(formData: FormData): Promise<PreviewResult>` — same shape and behavior as `previewTransferBatch` (`@/app/(protected)/activities/transfer/actions`), reading `file`/`eventDate`/optional `mapping` from `formData`, using the shared `resolveBatchRows`. Re-exports/mirrors `PreviewResult` from the transfer actions module's shape but is its own local type (no cross-route-group import — Next.js Server Action modules are meant to be self-contained per route).
  - `confirmHealthBatchAction(input: { headerSignature: string; mapping: ColumnMapping[]; products: HealthProduct[]; rows: ResolvedRow[] }): Promise<void>` — saves the column mapping (same `onConflictDoNothing` pattern as transfer) and calls `confirmHealthBatch`.
- Consumes: `requireSession` (`@/lib/dal/session`), `parseExcelFile` (`@/lib/activities/excel-parsing`), `computeHeaderSignature`/`applyColumnMapping` (`@/lib/activities/column-mapping`), `resolveBatchRows` (`@/lib/activities/batch-resolution`, Task 1), `confirmHealthBatch`/`HealthProduct` (`@/lib/activities/health`, Task 4), `columnMapping` (`@/db/schema`).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/activities/health-actions.test.ts`:

```typescript
// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, product, columnMapping } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { previewHealthBatch, confirmHealthBatchAction } = await import("./actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function buildWorkbookBuffer(headers: string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function seedManagerSession() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });

  vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === "active_farm_id" ? { value: seededFarm.id } : undefined),
  } as never);

  return { manager, seededFarm };
}

describe("previewHealthBatch", () => {
  it("asks for a column mapping the first time a header signature is seen", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000080"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(true);
  });

  it("applies a submitted mapping and resolves rows", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000081"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("new");
    }
  });
});

describe("confirmHealthBatchAction", () => {
  it("saves a new mapping and confirms the batch", async () => {
    const { seededFarm } = await seedManagerSession();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
      ],
      rows: [{ tag: "AR000000000082", eventDate: "2026-02-01", status: "new", categoryId: null }],
    });

    const [savedMapping] = await testDb
      .select()
      .from(columnMapping)
      .where(eq(columnMapping.headerSignature, JSON.stringify(["IDE"])));
    expect(savedMapping).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- health-actions.test.ts
```

Expected: FAIL — `./actions` module doesn't exist under `app/(protected)/activities/health/`.

- [ ] **Step 3: Write the implementation**

Create `web/app/(protected)/activities/health/actions.ts`:

```typescript
"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import { confirmHealthBatch, type HealthProduct } from "@/lib/activities/health";

export type PreviewResult =
  | { mappingNeeded: true; headers: string[] }
  | { mappingNeeded: false; headerSignature: string; mapping: ColumnMapping[]; rows: ResolvedRow[] };

async function requireOperatingFarmId(): Promise<string> {
  const cookieStore = await cookies();
  const activeFarmId = cookieStore.get("active_farm_id")?.value;
  if (!activeFarmId) {
    throw new Error("No hay un campo activo seleccionado");
  }
  return activeFarmId;
}

export async function previewHealthBatch(formData: FormData): Promise<PreviewResult> {
  await requireSession();

  const file = formData.get("file") as File;
  const eventDate = formData.get("eventDate") as string;
  const mappingOverride = formData.get("mapping") as string | null;

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);
  const headerSignature = computeHeaderSignature(headers);

  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    const [existing] = await db.select().from(columnMapping).where(eq(columnMapping.headerSignature, headerSignature));
    if (!existing) {
      return { mappingNeeded: true, headers };
    }
    mapping = existing.mapping as ColumnMapping[];
  }

  const mappedRows = applyColumnMapping(headers, rows, mapping);
  const resolvedRows = await resolveBatchRows(mappedRows, eventDate);

  return { mappingNeeded: false, headerSignature, mapping, rows: resolvedRows };
}

export async function confirmHealthBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  products: HealthProduct[];
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  const operatingFarmId = await requireOperatingFarmId();

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoNothing({ target: columnMapping.headerSignature });

  await confirmHealthBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId,
    products: input.products,
    rows: input.rows,
  });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- health-actions.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/activities/health/actions.ts" __tests__/activities/health-actions.test.ts
git commit -m "feat: add previewHealthBatch and confirmHealthBatchAction server actions"
```

---

## Task 6: UI

**Files:**
- Create: `web/components/activities/product-list-editor.tsx`
- Create: `web/components/activities/health-form.tsx`
- Create: `web/app/(protected)/activities/health/page.tsx`
- Create: `web/__tests__/components/health-form.test.tsx`

**Interfaces:**
- `ProductListEditor({ catalog, products, onChange }: { catalog: ProductCatalogEntry[]; products: HealthProduct[]; onChange: (products: HealthProduct[]) => void })` — renders one row per entry in `products` with a `<select>` of `catalog` products plus dose/unit/route/carencia/notes inputs; selecting a product prefills `doseUnit` from `catalog`'s `defaultDoseUnit` and `withdrawalDays` from `defaultWithdrawalDays` (only when the row's own value is still empty/null, so the user's edits are never clobbered); "+ Agregar producto" appends an empty row; each row has a "Quitar" button (disabled when it's the only row).
- `HealthForm({ catalog }: { catalog: ProductCatalogEntry[] })` (client component, default export) — same upload/date/mapping/preview flow as `TransferForm`, but renders `ProductListEditor` instead of destination farm/paddock fields, and calls `confirmHealthBatchAction`.
- `web/app/(protected)/activities/health/page.tsx` (server component) — calls `listProducts()` (Task 3) and renders `<HealthForm catalog={...} />` inside a `<Card>`.
- Consumes: `previewHealthBatch`, `confirmHealthBatchAction`, `HealthProduct` (Task 5), `listProducts`, `ProductCatalogEntry` (Task 3), `ColumnMapper`, `TransferPreviewTable` (reused as-is from `@/components/activities/*` — the preview table's columns don't depend on the activity type), `Button`/`Input`/`Label`/`Card` (`@/components/ui/*`).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/components/health-form.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HealthForm } from "@/components/activities/health-form";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

vi.mock("@/app/(protected)/activities/health/actions", () => ({
  previewHealthBatch: vi.fn(async () => ({
    mappingNeeded: false,
    headerSignature: '["IDE"]',
    mapping: [{ header: "IDE", meaning: "tag" }],
    rows: [{ tag: "AR000000000090", eventDate: "2026-02-01", status: "new", categoryId: null }],
  })),
  confirmHealthBatchAction: vi.fn(async () => undefined),
}));

const catalog: ProductCatalogEntry[] = [
  { id: "p1", name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
];

describe("HealthForm", () => {
  it("shows the preview and lets the user add a product row", async () => {
    render(<HealthForm catalog={catalog} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /agregar producto/i }));
    expect(screen.getAllByText("Ivermectina 1%")).not.toHaveLength(0);
  });

  it("prefills dose unit and withdrawal days from the selected product's defaults", async () => {
    render(<HealthForm catalog={catalog} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/producto/i), "p1");

    expect(screen.getByLabelText(/unidad/i)).toHaveValue("ml");
    expect(screen.getByLabelText(/carencia/i)).toHaveValue(21);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- health-form.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/activities/health-form'`.

- [ ] **Step 3: Write `ProductListEditor`**

Create `web/components/activities/product-list-editor.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { HealthProduct } from "@/lib/activities/health";

function emptyProduct(): HealthProduct {
  return { productId: "", dose: "", doseUnit: "", route: "", withdrawalDays: null, notes: null };
}

export function ProductListEditor({
  catalog,
  products,
  onChange,
}: {
  catalog: ProductCatalogEntry[];
  products: HealthProduct[];
  onChange: (products: HealthProduct[]) => void;
}) {
  function updateRow(index: number, patch: Partial<HealthProduct>) {
    onChange(products.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function selectProduct(index: number, productId: string) {
    const catalogEntry = catalog.find((c) => c.id === productId);
    const current = products[index];
    updateRow(index, {
      productId,
      doseUnit: current.doseUnit || catalogEntry?.defaultDoseUnit || "",
      withdrawalDays: current.withdrawalDays ?? catalogEntry?.defaultWithdrawalDays ?? null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {products.map((productRow, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`product-${index}`}>Producto</Label>
            <select
              id={`product-${index}`}
              aria-label="Producto"
              value={productRow.productId}
              onChange={(e) => selectProduct(index, e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Elegir producto</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`dose-${index}`}>Dosis</Label>
            <Input
              id={`dose-${index}`}
              value={productRow.dose}
              onChange={(e) => updateRow(index, { dose: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`unit-${index}`}>Unidad</Label>
            <Input
              id={`unit-${index}`}
              aria-label="Unidad"
              value={productRow.doseUnit}
              onChange={(e) => updateRow(index, { doseUnit: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`route-${index}`}>Vía</Label>
            <Input
              id={`route-${index}`}
              value={productRow.route}
              onChange={(e) => updateRow(index, { route: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`withdrawal-${index}`}>Carencia (días)</Label>
            <Input
              id={`withdrawal-${index}`}
              aria-label="Carencia"
              type="number"
              value={productRow.withdrawalDays ?? ""}
              onChange={(e) => updateRow(index, { withdrawalDays: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={products.length === 1}
            onClick={() => onChange(products.filter((_, i) => i !== index))}
          >
            Quitar
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...products, emptyProduct()])}>
        + Agregar producto
      </Button>
    </div>
  );
}

export { emptyProduct };
```

- [ ] **Step 4: Write `HealthForm`**

Create `web/components/activities/health-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import {
  previewHealthBatch,
  confirmHealthBatchAction,
  type PreviewResult,
} from "@/app/(protected)/activities/health/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { HealthProduct } from "@/lib/activities/health";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

export function HealthForm({ catalog }: { catalog: ProductCatalogEntry[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [products, setProducts] = useState<HealthProduct[]>([emptyProduct()]);
  const [confirmed, setConfirmed] = useState(false);

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewHealthBatch(formData);
    setPreview(result);
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded) return;
    await confirmHealthBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      products,
      rows: preview.rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const hasIncompleteProduct = products.some((p) => !p.productId || !p.dose || !p.doseUnit || !p.route);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="eventDate">Fecha</Label>
        <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>
      <Button type="button" onClick={() => runPreview()}>
        Subir
      </Button>

      {preview?.mappingNeeded ? (
        <ColumnMapper headers={preview.headers} onSubmit={(mapping) => runPreview(mapping)} />
      ) : null}

      {preview && !preview.mappingNeeded ? (
        <div className="flex flex-col gap-4">
          <ProductListEditor catalog={catalog} products={products} onChange={setProducts} />
          <TransferPreviewTable rows={preview.rows} />
          <Button
            type="button"
            disabled={preview.rows.some((r) => r.status === "error") || hasIncompleteProduct}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Write the page**

Create `web/app/(protected)/activities/health/page.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthForm } from "@/components/activities/health-form";
import { listProducts } from "@/lib/dal/product-catalog";

export default async function HealthActivityPage() {
  const catalog = await listProducts();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sanidad</CardTitle>
      </CardHeader>
      <CardContent>
        <HealthForm catalog={catalog} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
cd web && npm run test -- health-form.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file.

- [ ] **Step 8: Commit**

```bash
git add components/activities/product-list-editor.tsx components/activities/health-form.tsx "app/(protected)/activities/health/page.tsx" __tests__/components/health-form.test.tsx
git commit -m "feat: add sanidad (health) activity UI (product list, preview, confirm)"
```

---

## Task 7: End-to-end test

**Files:**
- Create: `web/e2e/health-activity.spec.ts`
- Modify: `web/e2e/global-setup.ts`

**Interfaces:**
- Consumes: the full stack built in Tasks 1–6, plus the seeded admin user and a product seeded directly via SQL in this test's setup (no product-management UI exists yet).

- [ ] **Step 1: Seed a product for the test**

Modify `web/e2e/global-setup.ts` — add one product insert after the existing `db:seed` call in `globalSetup()`:

```typescript
  execSync(`DATABASE_URL="${testUrl}" npm run db:seed`, {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
      SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "changeme123",
    },
  });

  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query(
      "insert into product (name, default_dose_unit, default_withdrawal_days) values ('Ivermectina 1%', 'ml', 21) on conflict do nothing"
    );
  } finally {
    await client.end();
  }
}
```

(This appends to the existing `globalSetup` function body, after the `execSync(...)` call already there — the closing `}` shown is the function's own, not a new one.)

- [ ] **Step 2: Write the E2E test**

Create `web/e2e/health-activity.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("uploads a health Excel, maps columns, adds a product, and confirms the batch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/health");

  await page
    .getByLabel(/archivo/i)
    .setInputFiles(path.join(__dirname, "fixtures", "transfer-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("IDE").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000099")).toBeVisible();

  await page.getByLabel("Producto").selectOption({ label: "Ivermectina 1%" });
  await page.getByLabel("Dosis", { exact: true }).fill("10");
  await page.getByLabel("Vía").fill("subcutánea");

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});
```

(Reuses the `transfer-lote.xlsx` fixture already created for the transfer activity — same header/tag shape works here too, since the Excel side is identical between activities.)

- [ ] **Step 3: Run the E2E suite and confirm it passes**

```bash
cd web && export $(grep -v '^#' .env.local | xargs) && npm run test:e2e -- health-activity.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full E2E suite to confirm no regressions**

```bash
npm run test:e2e
```

Expected: PASS, every spec file (`auth-flow.spec.ts`, `transfer-activity.spec.ts`, `health-activity.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add e2e/health-activity.spec.ts e2e/global-setup.ts
git commit -m "test: add end-to-end coverage for the sanidad activity flow"
```

---

## Post-plan note

This plan delivers a working, testable "sanidad" flow, completing the second of four reference activities from [`docs/superpowers/specs/2026-07-20-activity-loading-design.md`](../specs/2026-07-20-activity-loading-design.md). Deferred to follow-up plans: recategorización, venta, baja; mapping a Producto column from the Excel to prefill the product list; a real farm/paddock picker (already deferred from the transfer plan, applies here too via the shared UI pieces where relevant).
