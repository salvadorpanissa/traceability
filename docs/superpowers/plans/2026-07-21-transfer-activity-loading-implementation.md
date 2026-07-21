# Transfer Activity Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end "traslado" (transfer) activity-loading flow — upload an Excel of tags, map its columns (remembered by header signature), preview existing/new animals, and confirm the batch — as described in [`docs/superpowers/specs/2026-07-21-transfer-activity-loading-design.md`](../specs/2026-07-21-transfer-activity-loading-design.md).

**Architecture:** Pure parsing/mapping functions (`web/lib/activities/excel-parsing.ts`, `column-mapping.ts`) have no DB dependency and are the first, cheapest thing to test. DB-touching resolution (`resolveBatchRows`) and the transactional write (`confirmTransferBatch`) live in `web/lib/activities/transfer.ts`, reusing the existing DAL (`requireFarmAccess`, `requireTransferAuthorization`). Two Server Actions in `web/app/(protected)/activities/transfer/actions.ts` wire the DAL layer to the client, mirroring the existing `select-farm/actions.ts` pattern (`requireSession()` + `active_farm_id` cookie, never trusting the client for authorization). The UI is a client component tree under `web/app/(protected)/activities/transfer/`, using plain `<select>` elements (matching the existing settings-menu pattern) rather than introducing a new Base UI Select wrapper — YAGNI for a single-page form.

**Tech Stack:** `exceljs` (new dependency) for server-side Excel parsing — chosen over `xlsx`/SheetJS, which has unpatched high-severity ReDoS/prototype-pollution advisories in its free package, a real concern since this code parses untrusted user-uploaded files. Everything else is the existing stack: Drizzle, Next.js Server Actions, Vitest, Playwright.

## Global Constraints

- All UI copy in Spanish (matches the rest of the app).
- The uploaded Excel is never persisted — not to disk, not to any table. Only the parsed `{headers, rows}` and the resolved preview travel between the two Server Actions, via the client's React state.
- If any row has a validation error (duplicate tag, sold/dead animal, unrecognized category name), confirmation is blocked for the whole batch — no partial application.
- `column_mapping` is saved only at confirm time, not at preview time — an abandoned upload never leaves an orphaned mapping row.
- Every DB-touching function in `web/lib/activities/` takes explicit `userId`/`role` and calls the existing DAL (`requireFarmAccess`, `requireTransferAuthorization`) — never assume a Server Action's caller is already authorized.
- `requireTransferAuthorization` (`web/lib/dal/animal-access.ts`) is not modified — a same-farm transfer (including potrero-to-potrero) needs no admin check; a cross-farm one does.

---

## Task 1: `column_mapping` table

**Files:**
- Create: `web/db/schema/column-mapping.ts`
- Modify: `web/db/schema/index.ts`
- Modify: `web/test/reset-db.ts`
- Create: `web/__tests__/schema/column-mapping.test.ts`

**Interfaces:**
- Produces: `columnMapping(id, headerSignature, mapping, createdAt)`, exported from `@/db/schema`. `headerSignature` is `text().unique()`; `mapping` is `jsonb().notNull()` (an array of `{ header: string, meaning: "tag" | "date" | "category" | "ignore" }`, stored as plain JSON — no Drizzle-level typing needed at the column, callers cast at the boundary in Task 3).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/schema/column-mapping.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { columnMapping } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("column_mapping table", () => {
  it("stores a mapping keyed by a unique header signature", async () => {
    const signature = JSON.stringify(["IDE", "Fecha", "SANIDAD"]);
    const mapping = [
      { header: "IDE", meaning: "tag" },
      { header: "Fecha", meaning: "date" },
      { header: "SANIDAD", meaning: "ignore" },
    ];

    const [created] = await testDb.insert(columnMapping).values({ headerSignature: signature, mapping }).returning();
    expect(created.mapping).toEqual(mapping);

    await expect(
      testDb.insert(columnMapping).values({ headerSignature: signature, mapping: [] })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- schema/column-mapping.test.ts
```

Expected: FAIL — `columnMapping` not exported from `@/db/schema`.

- [ ] **Step 3: Write the schema file**

Create `web/db/schema/column-mapping.ts`:

```typescript
import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const columnMapping = pgTable("column_mapping", {
  id: uuid("id").primaryKey().defaultRandom(),
  headerSignature: text("header_signature").notNull().unique(),
  mapping: jsonb("mapping").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Modify `web/db/schema/index.ts` (add one line):

```typescript
export * from "./column-mapping";
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd web && npm run db:generate
npm run db:migrate:test
npm run db:migrate
```

Expected: new migration file with `CREATE TABLE "column_mapping"`; both migrate commands succeed.

- [ ] **Step 5: Extend the test-db reset helper**

Modify `web/test/reset-db.ts` — add anywhere (no FK dependents or dependencies):

```typescript
  await testDb.execute(sql`TRUNCATE TABLE column_mapping RESTART IDENTITY CASCADE`);
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test -- schema/column-mapping.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 7: Commit**

```bash
git add db/schema/column-mapping.ts db/schema/index.ts drizzle/ test/reset-db.ts __tests__/schema/column-mapping.test.ts
git commit -m "feat: add column_mapping table for remembered Excel header mappings"
```

---

## Task 2: Excel parsing

**Files:**
- Create: `web/lib/activities/excel-parsing.ts`
- Create: `web/__tests__/lib/activities/excel-parsing.test.ts`

**Interfaces:**
- Produces: `parseExcelFile(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }>` — reads the first worksheet; row 1 is headers; every cell is read as a trimmed string (numbers/dates are coerced via `.toString()` — tag values are always text in practice, and any real date column is handled later by `applyColumnMapping`, not here).
- Consumes: nothing new.

- [ ] **Step 1: Install exceljs**

```bash
cd web && npm install exceljs
```

Expected: `exceljs` added to `package.json` dependencies. No separate `@types/exceljs` needed — it ships its own types.

- [ ] **Step 2: Write the failing test**

Create `web/__tests__/lib/activities/excel-parsing.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseExcelFile } from "@/lib/activities/excel-parsing";

async function buildWorkbookBuffer(headers: string[], rows: (string | number)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("parseExcelFile", () => {
  it("reads the first row as headers and the rest as string rows", async () => {
    const buffer = await buildWorkbookBuffer(
      ["IDE", "Fecha", "SANIDAD"],
      [
        ["123456789012345", "2026-01-15", "ASPERSIN"],
        ["223456789012345", "2026-01-15", "AFTOSA"],
      ]
    );

    const { headers, rows } = await parseExcelFile(buffer);

    expect(headers).toEqual(["IDE", "Fecha", "SANIDAD"]);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe("123456789012345");
    expect(rows[1][2]).toBe("AFTOSA");
  });

  it("returns an empty rows array for a header-only file", async () => {
    const buffer = await buildWorkbookBuffer(["IDE"], []);
    const { headers, rows } = await parseExcelFile(buffer);
    expect(headers).toEqual(["IDE"]);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
npm run test -- excel-parsing.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/activities/excel-parsing'`.

- [ ] **Step 4: Write the implementation**

Create `web/lib/activities/excel-parsing.ts`:

```typescript
import ExcelJS from "exceljs";

export type ParsedExcel = {
  headers: string[];
  rows: string[][];
};

export async function parseExcelFile(buffer: ArrayBuffer): Promise<ParsedExcel> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [] };
  }

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(cell.text.trim());
  });

  const rows: string[][] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    const values: string[] = [];
    for (let col = 1; col <= headers.length; col++) {
      values.push(row.getCell(col).text.trim());
    }
    rows.push(values);
  }

  return { headers, rows };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm run test -- excel-parsing.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/activities/excel-parsing.ts __tests__/lib/activities/excel-parsing.test.ts
git commit -m "feat: add pure Excel parsing for activity batch uploads"
```

---

## Task 3: Column mapping

**Files:**
- Create: `web/lib/activities/column-mapping.ts`
- Create: `web/__tests__/lib/activities/column-mapping.test.ts`

**Interfaces:**
- Produces:
  - `type ColumnMeaning = "tag" | "date" | "category" | "ignore"`
  - `type ColumnMapping = { header: string; meaning: ColumnMeaning }`
  - `type MappedRow = { tag: string; date: string | null; category: string | null }`
  - `computeHeaderSignature(headers: string[]): string` — `JSON.stringify(headers)`, exact name + order.
  - `applyColumnMapping(headers: string[], rows: string[][], mapping: ColumnMapping[]): MappedRow[]` — for each raw row, looks up the column index for the header mapped to `"tag"` (required — every row gets `tag = ""` if the column is missing or the mapped header isn't found, left for `resolveBatchRows` in Task 4 to flag as an error) and for `"date"`/`"category"` (optional — `null` if not mapped or the header isn't found).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/lib/activities/column-mapping.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";

describe("computeHeaderSignature", () => {
  it("is stable for the same headers in the same order", () => {
    expect(computeHeaderSignature(["IDE", "Fecha"])).toBe(computeHeaderSignature(["IDE", "Fecha"]));
  });

  it("differs when header order differs", () => {
    expect(computeHeaderSignature(["IDE", "Fecha"])).not.toBe(computeHeaderSignature(["Fecha", "IDE"]));
  });
});

describe("applyColumnMapping", () => {
  const headers = ["IDE", "Fecha", "SEXO"];
  const rows = [
    ["123456789012345", "2026-01-15", "M"],
    ["223456789012345", "", "H"],
  ];

  it("maps tag and date columns, leaving unmapped columns out", () => {
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "Fecha", meaning: "date" },
      { header: "SEXO", meaning: "ignore" },
    ];

    const result = applyColumnMapping(headers, rows, mapping);

    expect(result).toEqual([
      { tag: "123456789012345", date: "2026-01-15", category: null },
      { tag: "223456789012345", date: "", category: null },
    ]);
  });

  it("leaves tag empty when no column is mapped to it", () => {
    const mapping: ColumnMapping[] = [{ header: "IDE", meaning: "ignore" }];
    const result = applyColumnMapping(headers, rows, mapping);
    expect(result[0].tag).toBe("");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- column-mapping.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/activities/column-mapping'`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/activities/column-mapping.ts`:

```typescript
export type ColumnMeaning = "tag" | "date" | "category" | "ignore";

export type ColumnMapping = {
  header: string;
  meaning: ColumnMeaning;
};

export type MappedRow = {
  tag: string;
  date: string | null;
  category: string | null;
};

export function computeHeaderSignature(headers: string[]): string {
  return JSON.stringify(headers);
}

function columnIndexFor(headers: string[], mapping: ColumnMapping[], meaning: ColumnMeaning): number {
  const mapped = mapping.find((m) => m.meaning === meaning);
  if (!mapped) return -1;
  return headers.indexOf(mapped.header);
}

export function applyColumnMapping(headers: string[], rows: string[][], mapping: ColumnMapping[]): MappedRow[] {
  const tagIndex = columnIndexFor(headers, mapping, "tag");
  const dateIndex = columnIndexFor(headers, mapping, "date");
  const categoryIndex = columnIndexFor(headers, mapping, "category");

  return rows.map((row) => ({
    tag: tagIndex >= 0 ? (row[tagIndex] ?? "") : "",
    date: dateIndex >= 0 ? (row[dateIndex] ?? null) : null,
    category: categoryIndex >= 0 ? (row[categoryIndex] || null) : null,
  }));
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- column-mapping.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/activities/column-mapping.ts __tests__/lib/activities/column-mapping.test.ts
git commit -m "feat: add column-mapping application logic (pure)"
```

---

## Task 4: `resolveBatchRows`

**Files:**
- Create: `web/lib/activities/transfer.ts`
- Create: `web/__tests__/lib/activities/transfer-resolve.test.ts`

**Interfaces:**
- Produces:
  - `type ResolvedRow = { tag: string; eventDate: string } & ({ status: "existing"; animalId: string; currentFarmId: string | null; currentPaddockId: string | null } | { status: "new"; categoryId: string | null } | { status: "error"; reason: string })`
  - `resolveBatchRows(rows: MappedRow[], formEventDate: string): Promise<ResolvedRow[]>` — for each row: resolves `eventDate` (the row's own `date`, if present and a valid `YYYY-MM-DD` string, else `formEventDate`); looks up the tag in `animal_tag_history`; if found, joins `animal_current_state` for `current_farm_id`/`current_paddock_id`/`status`, erroring if `status !== "alive"`; if not found, resolves `category` (if mapped and non-empty) against the `category` catalog by name, erroring if it doesn't match any row; flags empty `tag` and duplicate `tag` (within the same call) as row errors that override any other outcome for that row.
- Consumes: `db` (`@/db`), `animal`, `animalTagHistory`, `category` (`@/db/schema`), raw `sql` for `animal_current_state` (no Drizzle schema object, per the core-schema spec).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/lib/activities/transfer-resolve.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  category,
} from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveBatchRows } = await import("@/lib/activities/transfer");

beforeEach(async () => {
  await resetTestDb();
});

async function seedExistingAnimal(tag: string, opts: { sold?: boolean } = {}) {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });

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
  await testDb
    .insert(eventTransfer)
    .values({ eventId: createdEvent.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id });

  if (opts.sold) {
    const [saleBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "sale", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [saleEvent] = await testDb
      .insert(event)
      .values({
        eventType: "sale",
        eventDate: "2026-01-02",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: saleBatch.id,
        createdBy: user.id,
      })
      .returning();
    const { eventSale } = await import("@/db/schema");
    await testDb.insert(eventSale).values({ eventId: saleEvent.id });
  }

  return { seededFarm, createdAnimal };
}

describe("resolveBatchRows", () => {
  it("resolves an existing, alive animal with its current location", async () => {
    const { seededFarm, createdAnimal } = await seedExistingAnimal("AR000000000001");
    const rows: MappedRow[] = [{ tag: "AR000000000001", date: null, category: null }];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01");

    expect(resolved).toMatchObject({
      status: "existing",
      tag: "AR000000000001",
      animalId: createdAnimal.id,
      currentFarmId: seededFarm.id,
      eventDate: "2026-02-01",
    });
  });

  it("errors a sold or dead animal", async () => {
    await seedExistingAnimal("AR000000000002", { sold: true });
    const rows: MappedRow[] = [{ tag: "AR000000000002", date: null, category: null }];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.status).toBe("error");
  });

  it("resolves a new tag with a matching category", async () => {
    const [createdCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const rows: MappedRow[] = [{ tag: "AR000000000003", date: null, category: "Vaca" }];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved).toMatchObject({ status: "new", tag: "AR000000000003", categoryId: createdCategory.id });
  });

  it("errors a new tag with an unrecognized category", async () => {
    const rows: MappedRow[] = [{ tag: "AR000000000004", date: null, category: "NoExiste" }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.status).toBe("error");
  });

  it("errors both rows of a duplicated tag within the same file", async () => {
    const rows: MappedRow[] = [
      { tag: "AR000000000005", date: null, category: null },
      { tag: "AR000000000005", date: null, category: null },
    ];
    const resolved = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved[0].status).toBe("error");
    expect(resolved[1].status).toBe("error");
  });

  it("errors an empty tag", async () => {
    const rows: MappedRow[] = [{ tag: "", date: null, category: null }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.status).toBe("error");
  });

  it("uses the row's own date over the form date when present and valid", async () => {
    const rows: MappedRow[] = [{ tag: "AR000000000006", date: "2026-03-10", category: null }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.eventDate).toBe("2026-03-10");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run test -- transfer-resolve.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/activities/transfer'`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/activities/transfer.ts`:

```typescript
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animal, animalTagHistory, category } from "@/db/schema";
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

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- transfer-resolve.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/activities/transfer.ts __tests__/lib/activities/transfer-resolve.test.ts
git commit -m "feat: add resolveBatchRows for the transfer activity"
```

---

## Task 5: `confirmTransferBatch`

**Files:**
- Modify: `web/lib/activities/transfer.ts`
- Create: `web/__tests__/lib/activities/transfer-confirm.test.ts`

**Interfaces:**
- Produces: `confirmTransferBatch(input: { userId: string; role: string | undefined; operatingFarmId: string; destinationFarmId: string; destinationPaddockId: string | null; rows: ResolvedRow[] }): Promise<void>` — throws if any row has `status: "error"`, if the caller lacks access to `operatingFarmId`, if the transfer is cross-farm and the caller isn't admin, or if `destinationPaddockId` doesn't belong to `destinationFarmId`. Otherwise, in one transaction: one `batch_operation`; for `"new"` rows, an `animal` + `animal_tag_history` row first; then, for every row, one `event` + `event_transfer` (origin = the row's current location for `"existing"`, or `operatingFarmId`/no paddock for `"new"`; destination = the function's `destinationFarmId`/`destinationPaddockId`).
- Consumes: `requireFarmAccess`, `isAdmin` (`@/lib/dal/farm-access`), `requireTransferAuthorization` (`@/lib/dal/animal-access`), `batchOperation`, `event`, `eventTransfer`, `animal`, `animalTagHistory`, `paddock` (`@/db/schema`), `resolveBatchRows`'s `ResolvedRow` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/lib/activities/transfer-confirm.test.ts`:

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
  paddock,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
} from "@/db/schema";
import type { ResolvedRow } from "@/lib/activities/transfer";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmTransferBatch } = await import("@/lib/activities/transfer");

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

describe("confirmTransferBatch", () => {
  it("creates a new animal, its tag history, and a transfer event", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [destinationPaddock] = await testDb
      .insert(paddock)
      .values({ farmId: seededFarm.id, name: "Potrero 1" })
      .returning();

    const rows: ResolvedRow[] = [{ tag: "AR000000000010", eventDate: "2026-02-01", status: "new", categoryId: null }];

    await confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: seededFarm.id,
      destinationFarmId: seededFarm.id,
      destinationPaddockId: destinationPaddock.id,
      rows,
    });

    const [createdAnimal] = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.tag, "AR000000000010"));
    expect(createdAnimal).toBeDefined();

    const events = await testDb.select().from(event).where(eq(event.animalId, createdAnimal.animalId));
    expect(events).toHaveLength(1);

    const [transfer] = await testDb.select().from(eventTransfer).where(eq(eventTransfer.eventId, events[0].id));
    expect(transfer.destinationPaddockId).toBe(destinationPaddock.id);
    expect(transfer.originFarmId).toBe(seededFarm.id);
  });

  it("rejects a cross-farm transfer from a manager", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();

    const rows: ResolvedRow[] = [{ tag: "AR000000000011", eventDate: "2026-02-01", status: "new", categoryId: null }];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        destinationFarmId: otherFarm.id,
        destinationPaddockId: null,
        rows,
      })
    ).rejects.toThrow();
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const rows: ResolvedRow[] = [{ tag: "AR000000000012", eventDate: "2026-02-01", status: "error", reason: "x" }];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        destinationFarmId: seededFarm.id,
        destinationPaddockId: null,
        rows,
      })
    ).rejects.toThrow();

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });

  it("rejects a destination paddock that belongs to a different farm", async () => {
    const { manager, seededFarm } = await seedManagerAndFarm();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [wrongPaddock] = await testDb.insert(paddock).values({ farmId: otherFarm.id, name: "Potrero Sur" }).returning();

    const rows: ResolvedRow[] = [{ tag: "AR000000000013", eventDate: "2026-02-01", status: "new", categoryId: null }];

    await expect(
      confirmTransferBatch({
        userId: manager.id,
        role: "manager",
        operatingFarmId: seededFarm.id,
        destinationFarmId: seededFarm.id,
        destinationPaddockId: wrongPaddock.id,
        rows,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- transfer-confirm.test.ts
```

Expected: FAIL — `confirmTransferBatch` not exported from `@/lib/activities/transfer`.

- [ ] **Step 3: Add the implementation**

Append to `web/lib/activities/transfer.ts` (add these imports alongside the existing ones — `animal`, `animalTagHistory`, `category`, `eq`/`inArray`/`sql`, and `db` are already imported from Task 4, reuse those bindings as-is):

```typescript
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { requireTransferAuthorization } from "@/lib/dal/animal-access";
import { batchOperation, event, eventTransfer, paddock } from "@/db/schema";
```

```typescript
export async function confirmTransferBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  destinationFarmId: string;
  destinationPaddockId: string | null;
  rows: ResolvedRow[];
}): Promise<void> {
  const { userId, role, operatingFarmId, destinationFarmId, destinationPaddockId, rows } = input;

  await requireFarmAccess(userId, role, operatingFarmId);
  requireTransferAuthorization(role, operatingFarmId, destinationFarmId);

  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }

  if (destinationPaddockId) {
    const [destinationPaddockRow] = await db.select().from(paddock).where(eq(paddock.id, destinationPaddockId));
    if (!destinationPaddockRow || destinationPaddockRow.farmId !== destinationFarmId) {
      throw new Error("El potrero destino no pertenece al campo destino");
    }
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "transfer", farmId: operatingFarmId, animalCount: rows.length, createdBy: userId })
      .returning();

    for (const row of rows) {
      if (row.status === "error") continue;

      let animalId: string;
      let originFarmId: string;
      let originPaddockId: string | null;

      if (row.status === "existing") {
        animalId = row.animalId;
        originFarmId = row.currentFarmId ?? operatingFarmId;
        originPaddockId = row.currentPaddockId;
      } else {
        const [createdAnimal] = await tx.insert(animal).values({}).returning();
        await tx.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: row.tag });
        animalId = createdAnimal.id;
        originFarmId = operatingFarmId;
        originPaddockId = null;
      }

      const [createdEvent] = await tx
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
        eventId: createdEvent.id,
        originFarmId,
        destinationFarmId,
        originPaddockId,
        destinationPaddockId,
      });
    }
  });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- transfer-confirm.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/activities/transfer.ts __tests__/lib/activities/transfer-confirm.test.ts
git commit -m "feat: add confirmTransferBatch transactional write"
```

---

## Task 6: Server Actions

**Files:**
- Create: `web/app/(protected)/activities/transfer/actions.ts`
- Create: `web/__tests__/activities/transfer-actions.test.ts`

**Interfaces:**
- Produces:
  - `type PreviewResult = { mappingNeeded: true; headers: string[] } | { mappingNeeded: false; headerSignature: string; mapping: ColumnMapping[]; rows: ResolvedRow[] }`
  - `previewTransferBatch(formData: FormData): Promise<PreviewResult>` — reads `file` (a `File`), `eventDate` (string), and optionally `mapping` (a JSON-stringified `ColumnMapping[]`, present only when the client is submitting a just-chosen mapping) from `formData`.
  - `confirmTransferBatchAction(input: { headerSignature: string; mapping: ColumnMapping[]; destinationFarmId: string; destinationPaddockId: string | null; rows: ResolvedRow[] }): Promise<void>`.
- Consumes: `requireSession` (`@/lib/dal/session`), `parseExcelFile` (Task 2), `computeHeaderSignature`/`applyColumnMapping` (Task 3), `resolveBatchRows`/`confirmTransferBatch` (Tasks 4–5), `columnMapping` (`@/db/schema`).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/activities/transfer-actions.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, columnMapping } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { previewTransferBatch, confirmTransferBatchAction } = await import("./actions");
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

describe("previewTransferBatch", () => {
  it("asks for a column mapping the first time a header signature is seen", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000020"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(true);
  });

  it("applies a submitted mapping and resolves rows without saving it yet", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000021"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("new");
    }

    const savedMappings = await testDb.select().from(columnMapping);
    expect(savedMappings).toHaveLength(0);
  });

  it("reuses a previously saved mapping for the same header signature", async () => {
    await seedManagerSession();
    await testDb
      .insert(columnMapping)
      .values({ headerSignature: JSON.stringify(["IDE"]), mapping: [{ header: "IDE", meaning: "tag" }] });

    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000022"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
  });
});

describe("confirmTransferBatchAction", () => {
  it("saves a new mapping and confirms the batch", async () => {
    const { seededFarm } = await seedManagerSession();

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [{ tag: "AR000000000023", eventDate: "2026-02-01", status: "new", categoryId: null }],
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
cd web && npm run test -- transfer-actions.test.ts
```

Expected: FAIL — `./actions` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `web/app/(protected)/activities/transfer/actions.ts`:

```typescript
"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolveBatchRows, confirmTransferBatch, type ResolvedRow } from "@/lib/activities/transfer";

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

export async function previewTransferBatch(formData: FormData): Promise<PreviewResult> {
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

export async function confirmTransferBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  destinationFarmId: string;
  destinationPaddockId: string | null;
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  const operatingFarmId = await requireOperatingFarmId();

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoNothing({ target: columnMapping.headerSignature });

  await confirmTransferBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId,
    destinationFarmId: input.destinationFarmId,
    destinationPaddockId: input.destinationPaddockId,
    rows: input.rows,
  });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- transfer-actions.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/activities/transfer/actions.ts" __tests__/activities/transfer-actions.test.ts
git commit -m "feat: add previewTransferBatch and confirmTransferBatchAction server actions"
```

---

## Task 7: UI

**Files:**
- Create: `web/components/activities/column-mapper.tsx`
- Create: `web/components/activities/transfer-preview-table.tsx`
- Create: `web/components/activities/transfer-form.tsx`
- Create: `web/app/(protected)/activities/transfer/page.tsx`
- Create: `web/__tests__/components/transfer-form.test.tsx`

**Interfaces:**
- `ColumnMapper({ headers, onSubmit }: { headers: string[]; onSubmit: (mapping: ColumnMapping[]) => void })` — one `<select>` per header (`Caravana` / `Fecha` / `Categoría` / `Ignorar`), a submit button disabled until exactly one header is set to `Caravana`.
- `TransferPreviewTable({ rows }: { rows: ResolvedRow[] })` — one row per `ResolvedRow`, showing tag, status (`Existente`/`Nuevo`/`Error`), current location for existing animals, and the error reason for error rows.
- `TransferForm()` (client component, default export) — orchestrates: file input + event date + "Subir" button → calls `previewTransferBatch`; if `mappingNeeded`, renders `ColumnMapper`, and resubmits with the chosen mapping; once resolved, renders destination farm/paddock `<select>`s (paddock list fetched for the chosen farm) and `TransferPreviewTable`; "Confirmar" is disabled if any row is an error, and calls `confirmTransferBatchAction`.
- `web/app/(protected)/activities/transfer/page.tsx` (server component) — just renders `<TransferForm />` inside a `<Card>`, matching the `login`/`select-farm` page shell pattern.
- Consumes: `previewTransferBatch`, `confirmTransferBatchAction` (Task 6), `Button`/`Input`/`Label`/`Card` (`@/components/ui/*`), `useLocale` (`@/lib/i18n/context`) is **not** used here — this page's copy is hardcoded Spanish like the rest of the pre-i18n-port pages (`dashboard`, `select-farm`'s "no farms" message already follow this precedent for server-rendered strings not yet in the dictionary).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/components/transfer-form.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferForm } from "@/components/activities/transfer-form";

vi.mock("@/app/(protected)/activities/transfer/actions", () => ({
  previewTransferBatch: vi.fn(async () => ({
    mappingNeeded: false,
    headerSignature: '["IDE"]',
    mapping: [{ header: "IDE", meaning: "tag" }],
    rows: [{ tag: "AR000000000030", eventDate: "2026-02-01", status: "new", categoryId: null }],
  })),
  confirmTransferBatchAction: vi.fn(async () => undefined),
}));

describe("TransferForm", () => {
  it("shows the preview after uploading a file", async () => {
    render(<TransferForm />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const fileInput = screen.getByLabelText(/archivo/i);
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByText("AR000000000030")).toBeInTheDocument());
    expect(screen.getByText(/nuevo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- transfer-form.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/activities/transfer-form'`.

- [ ] **Step 3: Write `ColumnMapper`**

Create `web/components/activities/column-mapper.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ColumnMapping, ColumnMeaning } from "@/lib/activities/column-mapping";

const MEANING_LABELS: Record<ColumnMeaning, string> = {
  tag: "Caravana",
  date: "Fecha",
  category: "Categoría",
  ignore: "Ignorar",
};

export function ColumnMapper({
  headers,
  onSubmit,
}: {
  headers: string[];
  onSubmit: (mapping: ColumnMapping[]) => void;
}) {
  const [meanings, setMeanings] = useState<Record<string, ColumnMeaning>>(() =>
    Object.fromEntries(headers.map((h) => [h, "ignore" as ColumnMeaning]))
  );

  const hasTag = Object.values(meanings).filter((m) => m === "tag").length === 1;

  return (
    <div className="flex flex-col gap-3">
      {headers.map((header) => (
        <div key={header} className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{header}</span>
          <select
            aria-label={header}
            value={meanings[header]}
            onChange={(e) => setMeanings({ ...meanings, [header]: e.target.value as ColumnMeaning })}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            {(Object.keys(MEANING_LABELS) as ColumnMeaning[]).map((meaning) => (
              <option key={meaning} value={meaning}>
                {MEANING_LABELS[meaning]}
              </option>
            ))}
          </select>
        </div>
      ))}
      <Button
        type="button"
        disabled={!hasTag}
        onClick={() => onSubmit(headers.map((header) => ({ header, meaning: meanings[header] })))}
      >
        Continuar
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Write `TransferPreviewTable`**

Create `web/components/activities/transfer-preview-table.tsx`:

```typescript
import type { ResolvedRow } from "@/lib/activities/transfer";

function statusLabel(row: ResolvedRow): string {
  if (row.status === "existing") return "Existente";
  if (row.status === "new") return "Nuevo";
  return "Error";
}

export function TransferPreviewTable({ rows }: { rows: ResolvedRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">Caravana</th>
          <th className="py-1 pr-2">Estado</th>
          <th className="py-1 pr-2">Detalle</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.tag}</td>
            <td className="py-1 pr-2">{statusLabel(row)}</td>
            <td className="py-1 pr-2 text-muted-foreground">
              {row.status === "error" ? row.reason : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Write `TransferForm`**

Create `web/components/activities/transfer-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import {
  previewTransferBatch,
  confirmTransferBatchAction,
  type PreviewResult,
} from "@/app/(protected)/activities/transfer/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";

export function TransferForm() {
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [destinationFarmId, setDestinationFarmId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewTransferBatch(formData);
    setPreview(result);
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded) return;
    await confirmTransferBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      destinationFarmId,
      destinationPaddockId: null,
      rows: preview.rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

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
          <div className="flex flex-col gap-2">
            <Label htmlFor="destinationFarm">Campo destino</Label>
            <Input
              id="destinationFarm"
              value={destinationFarmId}
              onChange={(e) => setDestinationFarmId(e.target.value)}
              placeholder="ID del campo destino"
            />
          </div>
          <TransferPreviewTable rows={preview.rows} />
          <Button
            type="button"
            disabled={preview.rows.some((r) => r.status === "error") || !destinationFarmId}
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

(The destination-farm field is a plain text `Input` for the farm id in this first slice, not a `<select>` populated from a farms list — there is no existing Server Action that lists farms for a non-admin picker outside `select-farm`'s own page. Wiring a real farm/paddock picker is a fast-follow once this flow is confirmed working end-to-end; it does not block the transfer logic itself.)

- [ ] **Step 6: Write the page**

Create `web/app/(protected)/activities/transfer/page.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferForm } from "@/components/activities/transfer-form";

export default function TransferActivityPage() {
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Traslado</CardTitle>
      </CardHeader>
      <CardContent>
        <TransferForm />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Run the test and confirm it passes**

```bash
cd web && npm run test -- transfer-form.test.tsx
```

Expected: PASS, 1 test.

- [ ] **Step 8: Commit**

```bash
git add components/activities "app/(protected)/activities/transfer/page.tsx" __tests__/components/transfer-form.test.tsx
git commit -m "feat: add transfer activity UI (upload, column mapping, preview, confirm)"
```

---

## Task 8: End-to-end test

**Files:**
- Modify: `web/e2e/global-setup.ts`
- Create: `web/e2e/fixtures/transfer-lote.xlsx` (generated by a small script, see Step 1)
- Create: `web/e2e/transfer-activity.spec.ts`

**Interfaces:**
- Consumes: the full stack built in Tasks 1–7, plus the existing seeded admin user (`e2e/global-setup.ts`).

- [ ] **Step 1: Fix the E2E test-db truncation list (schema drift since this file was last touched)**

`web/e2e/global-setup.ts`'s `truncateTestDb` still only truncates `user_farm`/`user_account`/`farm`/`role` — every table added since (categories, animals, events, paddocks, column mappings) is missing, so leftover rows from a previous E2E or Vitest run could leak into this "fresh" run. Modify `web/e2e/global-setup.ts`, replacing the body of `truncateTestDb` with the same full, FK-safe list already used by `web/test/reset-db.ts`:

```typescript
async function truncateTestDb(testUrl: string) {
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query("TRUNCATE TABLE event_transfer CASCADE");
    await client.query("TRUNCATE TABLE event_health CASCADE");
    await client.query("TRUNCATE TABLE event_retag CASCADE");
    await client.query("TRUNCATE TABLE event_recategorize CASCADE");
    await client.query("TRUNCATE TABLE event_sale CASCADE");
    await client.query("TRUNCATE TABLE event_death CASCADE");
    await client.query("TRUNCATE TABLE event CASCADE");
    await client.query("TRUNCATE TABLE batch_operation CASCADE");
    await client.query("TRUNCATE TABLE animal_tag_history CASCADE");
    await client.query("TRUNCATE TABLE animal RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE paddock CASCADE");
    await client.query("TRUNCATE TABLE user_farm CASCADE");
    await client.query("TRUNCATE TABLE user_account RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE farm RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE role RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE category RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE product RESTART IDENTITY CASCADE");
    await client.query("TRUNCATE TABLE column_mapping RESTART IDENTITY CASCADE");
  } finally {
    await client.end();
  }
}
```

- [ ] **Step 2: Generate the fixture workbook**

Run this one-off script (not committed — only its output is):

```bash
cd web && node -e "
const ExcelJS = require('exceljs');
(async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['IDE']);
  sheet.addRow(['AR000000000099']);
  await workbook.xlsx.writeFile('e2e/fixtures/transfer-lote.xlsx');
})();
"
```

Expected: creates `web/e2e/fixtures/transfer-lote.xlsx` with one header (`IDE`) and one data row (a tag that doesn't exist yet, so this run creates a new animal).

- [ ] **Step 3: Write the E2E test**

Create `web/e2e/transfer-activity.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("uploads a transfer Excel, maps columns, and confirms the batch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto("/activities/transfer");

  await page
    .getByLabel(/archivo/i)
    .setInputFiles(path.join(__dirname, "fixtures", "transfer-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  // First time this header signature is seen: map "IDE" to "Caravana".
  await page.getByLabel("IDE").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000099")).toBeVisible();
  await expect(page.getByText(/nuevo/i)).toBeVisible();
});
```

- [ ] **Step 4: Run the E2E suite and confirm it passes**

```bash
cd web && npm run test:e2e -- transfer-activity.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/global-setup.ts e2e/fixtures/transfer-lote.xlsx e2e/transfer-activity.spec.ts
git commit -m "test: add end-to-end coverage for the transfer activity flow"
```

---

## Post-plan note

This plan delivers a working, testable "traslado" flow — the first slice of [`docs/superpowers/specs/2026-07-20-activity-loading-design.md`](../specs/2026-07-20-activity-loading-design.md). Deferred to follow-up plans: sanidad (multi-producto), recategorización, venta, baja; sexo/propietario del animal; a real farm/paddock `<select>` picker for the destination fields (currently a plain text id input); selección de lote por criterio o tabla con checkboxes.
