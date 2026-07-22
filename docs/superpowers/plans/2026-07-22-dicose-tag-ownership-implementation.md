# Registro DICOSE y detección de caravanas ajenas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the system from silently auto-creating every unrecognized caravana as a new animal — require it to belong to a known DICOSE registration, and surface the two cases that need a human decision (a real stranger's tag, or a known tag read at the wrong farm) instead of hiding them.

**Architecture:** Two new tables (`dicose_registration`, `own_tag`) back a rewritten `resolveBatchRows`, which now classifies every previously-unseen tag as `"new"` (registered at this farm), `"wrong_farm"` (registered elsewhere — included with a warning), or `"foreign"` (unregistered — excluded unless the user forces it). Two new settings pages let any logged-in user manage DICOSE registrations and upload the Excel of caravanas that belong to each one.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM, ExcelJS (already a dependency), Vitest + Testing Library + Playwright.

## Global Constraints

- `owner` (existing table) is reused for AIP/SASG/any other legal entity — no new "company" concept.
- `dicose_registration` and `own_tag` are global catalogs (no farm-scoped authorization), manageable by any logged-in user — same authorization pattern as `category`/`product`/`owner` (`requireSession()` only, no `requireFarmAccess`).
- A tag matched to `own_tag` always gets its `ownerId` from the DICOSE registration, never from the activity Excel's free-text owner column. That column is a fallback used only for `"foreign"` rows.
- `"foreign"` rows are excluded from confirmation unless the user forces them, row by row, before confirming (reversible).
- `"wrong_farm"` rows are always included in confirmation — the warning is informational only, never blocking.
- No new "pastoreo authorization" table — a farm mismatch always shows the same `"wrong_farm"` warning regardless of whether it's an expected pastoreo arrangement.

---

### Task 1: DICOSE registration and own-tag registry — schema and DAL

**Files:**
- Create: `web/db/schema/dicose.ts`
- Modify: `web/db/schema/index.ts`
- Create: `web/lib/dal/dicose-registration.ts`
- Create: `web/lib/dal/own-tag.ts`
- Test: `web/__tests__/dal/dicose-registration.test.ts`
- Test: `web/__tests__/dal/own-tag.test.ts`

**Interfaces:**
- Produces: `dicoseRegistration`, `ownTag` Drizzle tables exported from `@/db/schema`.
- Produces: `type DicoseRegistrationEntry = { id: string; ownerId: string; ownerName: string; farmId: string; farmName: string; dicoseCode: string }`, `listDicoseRegistrations(): Promise<DicoseRegistrationEntry[]>`, `createDicoseRegistration(input: { ownerId: string; farmId: string; dicoseCode: string }): Promise<DicoseRegistrationEntry>` from `@/lib/dal/dicose-registration`. Tasks 2, 3, 5, 6, 7 use these.
- Produces: `type OwnTagImportResult = { inserted: number; skipped: number; invalid: number }`, `importOwnTags(dicoseRegistrationId: string, userId: string, rawValues: string[]): Promise<OwnTagImportResult>`, `countOwnTagsByRegistration(): Promise<{ dicoseRegistrationId: string; count: number; lastUploadedAt: Date | null }[]>` from `@/lib/dal/own-tag`. Task 6 uses these.

- [ ] **Step 1: Write the schema**

Create `web/db/schema/dicose.ts`:

```ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { owner } from "./owner";
import { farm } from "./farm";
import { userAccount } from "./user";

export const dicoseRegistration = pgTable("dicose_registration", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owner.id),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farm.id),
  dicoseCode: text("dicose_code").notNull(),
});

export const ownTag = pgTable("own_tag", {
  tag: text("tag").primaryKey(),
  dicoseRegistrationId: uuid("dicose_registration_id")
    .notNull()
    .references(() => dicoseRegistration.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => userAccount.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Export the new schema**

In `web/db/schema/index.ts`, add this line after `export * from "./column-mapping";`:

```ts
export * from "./dicose";
```

- [ ] **Step 3: Generate and apply the migration**

```bash
cd web
npm run db:generate
```

Expected: creates a new file `web/drizzle/00XX_<generated-name>.sql` containing `CREATE TABLE "dicose_registration" ...` and `CREATE TABLE "own_tag" ...`, and updates `web/drizzle/meta/_journal.json` automatically — no manual edits needed this time (unlike the hand-written view/role migrations, these are plain tables `drizzle-kit` can diff on its own).

```bash
npm run db:migrate
npm run db:migrate:test
```

Expected: both commands print "Migrations applied to ..." with no errors.

- [ ] **Step 4: Write the failing DAL tests**

Create `web/__tests__/dal/dicose-registration.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, owner } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listDicoseRegistrations, createDicoseRegistration } = await import("@/lib/dal/dicose-registration");

beforeEach(async () => {
  await resetTestDb();
});

describe("dicose-registration", () => {
  it("creates a registration and returns it with owner/farm names resolved", async () => {
    const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [createdFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();

    const created = await createDicoseRegistration({
      ownerId: createdOwner.id,
      farmId: createdFarm.id,
      dicoseCode: "151400442",
    });

    expect(created).toMatchObject({
      ownerId: createdOwner.id,
      ownerName: "AIP",
      farmId: createdFarm.id,
      farmName: "Campo San Antonio",
      dicoseCode: "151400442",
    });
  });

  it("lists every registration with owner/farm names resolved", async () => {
    const [ownerAip] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [ownerSasg] = await testDb.insert(owner).values({ name: "SASG" }).returning();
    const [createdFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();

    await createDicoseRegistration({ ownerId: ownerAip.id, farmId: createdFarm.id, dicoseCode: "151400442" });
    await createDicoseRegistration({ ownerId: ownerSasg.id, farmId: createdFarm.id, dicoseCode: "151422799" });

    const registrations = await listDicoseRegistrations();
    expect(registrations).toHaveLength(2);
    expect(registrations.map((r) => r.dicoseCode).sort()).toEqual(["151400442", "151422799"]);
  });
});
```

Create `web/__tests__/dal/own-tag.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, owner, dicoseRegistration } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { importOwnTags, countOwnTagsByRegistration } = await import("@/lib/dal/own-tag");

beforeEach(async () => {
  await resetTestDb();
});

async function seedRegistration() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: createdOwner.id, farmId: seededFarm.id, dicoseCode: "151400442" })
    .returning();
  return { registration, user };
}

describe("importOwnTags", () => {
  it("inserts new tags, ignoring blank and invalid values", async () => {
    const { registration, user } = await seedRegistration();

    const result = await importOwnTags(registration.id, user.id, ["100", "", "abc", "  200  "]);

    expect(result).toEqual({ inserted: 2, skipped: 0, invalid: 1 });
  });

  it("ignores duplicates within the same file and against already-imported tags", async () => {
    const { registration, user } = await seedRegistration();
    await importOwnTags(registration.id, user.id, ["100"]);

    const result = await importOwnTags(registration.id, user.id, ["100", "100", "200"]);

    expect(result).toEqual({ inserted: 1, skipped: 2, invalid: 0 });
  });
});

describe("countOwnTagsByRegistration", () => {
  it("counts imported tags per registration and tracks the last upload time", async () => {
    const { registration, user } = await seedRegistration();
    await importOwnTags(registration.id, user.id, ["100", "200"]);

    const counts = await countOwnTagsByRegistration();

    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ dicoseRegistrationId: registration.id, count: 2 });
    expect(counts[0].lastUploadedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd web && npx vitest run __tests__/dal/dicose-registration.test.ts __tests__/dal/own-tag.test.ts`
Expected: FAIL with "Cannot find module '@/lib/dal/dicose-registration'" (and the same for `own-tag`)

- [ ] **Step 6: Write the DAL implementations**

Create `web/lib/dal/dicose-registration.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dicoseRegistration, farm, owner } from "@/db/schema";

export type DicoseRegistrationEntry = {
  id: string;
  ownerId: string;
  ownerName: string;
  farmId: string;
  farmName: string;
  dicoseCode: string;
};

export async function listDicoseRegistrations(): Promise<DicoseRegistrationEntry[]> {
  return db
    .select({
      id: dicoseRegistration.id,
      ownerId: dicoseRegistration.ownerId,
      ownerName: owner.name,
      farmId: dicoseRegistration.farmId,
      farmName: farm.name,
      dicoseCode: dicoseRegistration.dicoseCode,
    })
    .from(dicoseRegistration)
    .innerJoin(owner, eq(owner.id, dicoseRegistration.ownerId))
    .innerJoin(farm, eq(farm.id, dicoseRegistration.farmId));
}

export async function createDicoseRegistration(input: {
  ownerId: string;
  farmId: string;
  dicoseCode: string;
}): Promise<DicoseRegistrationEntry> {
  const [created] = await db.insert(dicoseRegistration).values(input).returning();
  const [ownerRow] = await db.select({ name: owner.name }).from(owner).where(eq(owner.id, created.ownerId));
  const [farmRow] = await db.select({ name: farm.name }).from(farm).where(eq(farm.id, created.farmId));
  return {
    id: created.id,
    ownerId: created.ownerId,
    ownerName: ownerRow.name,
    farmId: created.farmId,
    farmName: farmRow.name,
    dicoseCode: created.dicoseCode,
  };
}
```

Create `web/lib/dal/own-tag.ts`:

```ts
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ownTag } from "@/db/schema";

export type OwnTagImportResult = { inserted: number; skipped: number; invalid: number };

const CARAVAN_PATTERN = /^\d+$/;

export async function importOwnTags(
  dicoseRegistrationId: string,
  userId: string,
  rawValues: string[]
): Promise<OwnTagImportResult> {
  const seen = new Set<string>();
  const validTags: string[] = [];
  let invalid = 0;

  for (const raw of rawValues) {
    const tag = raw.trim();
    if (!tag) continue;
    if (!CARAVAN_PATTERN.test(tag)) {
      invalid++;
      continue;
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    validTags.push(tag);
  }

  if (validTags.length === 0) {
    return { inserted: 0, skipped: 0, invalid };
  }

  const existingRows = await db.select({ tag: ownTag.tag }).from(ownTag).where(inArray(ownTag.tag, validTags));
  const existingTags = new Set(existingRows.map((r) => r.tag));
  const newTags = validTags.filter((tag) => !existingTags.has(tag));

  if (newTags.length > 0) {
    await db.insert(ownTag).values(newTags.map((tag) => ({ tag, dicoseRegistrationId, createdBy: userId })));
  }

  return { inserted: newTags.length, skipped: validTags.length - newTags.length, invalid };
}

export async function countOwnTagsByRegistration(): Promise<
  { dicoseRegistrationId: string; count: number; lastUploadedAt: Date | null }[]
> {
  return db
    .select({
      dicoseRegistrationId: ownTag.dicoseRegistrationId,
      count: sql<number>`count(*)::int`,
      lastUploadedAt: sql<Date | null>`max(${ownTag.createdAt})`,
    })
    .from(ownTag)
    .groupBy(ownTag.dicoseRegistrationId);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd web && npx vitest run __tests__/dal/dicose-registration.test.ts __tests__/dal/own-tag.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add web/db/schema/dicose.ts web/db/schema/index.ts web/drizzle web/lib/dal/dicose-registration.ts \
  web/lib/dal/own-tag.ts web/__tests__/dal/dicose-registration.test.ts web/__tests__/dal/own-tag.test.ts
git commit -m "feat: add dicose_registration and own_tag schema, migration, and DAL"
```

---

### Task 2: Core resolution logic — `resolveBatchRows` classifies foreign/wrong-farm tags

**Files:**
- Modify: `web/lib/activities/batch-resolution.ts`
- Modify: `web/lib/activities/animal-creation.ts`
- Modify: `web/__tests__/lib/activities/batch-resolution.test.ts`

**Interfaces:**
- Consumes: `dicoseRegistration`, `ownTag`, `farm` from `@/db/schema` (Task 1).
- Produces: `ResolvedRow` gains `"wrong_farm"` and `"foreign"` variants; `type CreatableRow = Extract<ResolvedRow, { status: "new" | "wrong_farm" | "foreign" }>`; `resolveBatchRows(rows: MappedRow[], formEventDate: string | null, operatingFarmId: string): Promise<ResolvedRow[]>` (now takes a third required argument). Both exported from `@/lib/activities/batch-resolution`. Task 3 imports `CreatableRow` and calls `resolveBatchRows` with the new signature; Task 4 renders the new statuses.

- [ ] **Step 1: Rewrite the test file with the new statuses and the required third argument**

Replace the full contents of `web/__tests__/lib/activities/batch-resolution.test.ts`:

```ts
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
  eventSale,
  category,
  owner,
  dicoseRegistration,
  ownTag,
} from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveBatchRows } = await import("@/lib/activities/batch-resolution");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmUserRole(farmName = "Campo Norte") {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: farmName }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: `admin-${farmName}@example.com`, passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { seededFarm, user };
}

async function seedExistingAnimal(tag: string, opts: { sold?: boolean } = {}) {
  const { seededFarm, user } = await seedFarmUserRole();
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
    await testDb.insert(eventSale).values({ eventId: saleEvent.id });
  }

  return { seededFarm, user, createdAnimal };
}

async function seedOwnTag(tag: string, farmId: string, userId: string, ownerName: string) {
  const [ownerRow] = await testDb.insert(owner).values({ name: ownerName }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: ownerRow.id, farmId, dicoseCode: "999999999" })
    .returning();
  await testDb.insert(ownTag).values({ tag, dicoseRegistrationId: registration.id, createdBy: userId });
  return ownerRow;
}

describe("resolveBatchRows", () => {
  it("resolves an existing, alive animal with its current location", async () => {
    const { seededFarm, createdAnimal } = await seedExistingAnimal("AR000000000001");
    const rows: MappedRow[] = [
      { tag: "AR000000000001", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);

    expect(resolved).toMatchObject({
      status: "existing",
      tag: "AR000000000001",
      animalId: createdAnimal.id,
      currentFarmId: seededFarm.id,
      eventDate: "2026-02-01",
    });
  });

  it("errors a sold or dead animal", async () => {
    const { seededFarm } = await seedExistingAnimal("AR000000000002", { sold: true });
    const rows: MappedRow[] = [
      { tag: "AR000000000002", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("error");
  });

  it("resolves a registered tag at its own farm with a matching category", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000003", seededFarm.id, user.id, "AIP");
    const [createdCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const rows: MappedRow[] = [
      { tag: "AR000000000003", date: null, category: "Vaca", sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", tag: "AR000000000003", categoryId: createdCategory.id });
  });

  it("errors an unregistered tag with an unrecognized category before checking ownership", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000004", date: null, category: "NoExiste", sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("error");
  });

  it("errors both rows of a duplicated tag within the same file", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000005", date: null, category: null, sex: null, ownerName: null, notes: null },
      { tag: "AR000000000005", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];
    const resolved = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved[0].status).toBe("error");
    expect(resolved[1].status).toBe("error");
  });

  it("errors an empty tag", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [{ tag: "", date: null, category: null, sex: null, ownerName: null, notes: null }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("error");
  });

  it("uses the row's own date over the form date when present and valid", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000006", date: "2026-03-10", category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.eventDate).toBe("2026-03-10");
  });

  it("normalizes a recognized sex value for a registered tag", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000030", seededFarm.id, user.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000030", date: null, category: null, sex: "MACHO", ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", sex: "male" });
  });

  it("leaves sex null for an unrecognized value, without erroring the row", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000031", seededFarm.id, user.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000031", date: null, category: null, sex: "???", ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", sex: null });
  });

  it("infers the owner from the tag's DICOSE registration, ignoring the Excel owner column", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    const registeredOwner = await seedOwnTag("AR000000000032", seededFarm.id, user.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000032", date: null, category: null, sex: null, ownerName: "Gómez", notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", ownerId: registeredOwner.id, pendingOwnerName: null });
  });

  it("ignores the owner column for an existing animal's row", async () => {
    const { seededFarm } = await seedExistingAnimal("AR000000000034");
    const rows: MappedRow[] = [
      { tag: "AR000000000034", date: null, category: null, sex: "M", ownerName: "Gómez", notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("existing");
    expect(resolved).not.toHaveProperty("ownerId");
    expect(resolved).not.toHaveProperty("pendingOwnerName");
  });

  it("uses the row's own date when there is no fallback", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000035", seededFarm.id, user.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000035", date: "2026-03-10", category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, null, seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", eventDate: "2026-03-10" });
  });

  it("errors a row with no date and no fallback provided", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000036", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, null, seededFarm.id);
    expect(resolved).toMatchObject({ status: "error", reason: "Falta la fecha" });
  });

  it("carries the row's notes through for a registered tag", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000037", seededFarm.id, user.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000037", date: null, category: null, sex: null, ownerName: null, notes: "Cojera leve" },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", notes: "Cojera leve" });
  });

  it("carries the row's notes through for an existing animal", async () => {
    const { seededFarm } = await seedExistingAnimal("AR000000000038");
    const rows: MappedRow[] = [
      { tag: "AR000000000038", date: null, category: null, sex: null, ownerName: null, notes: "Revisar próxima vez" },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "existing", notes: "Revisar próxima vez" });
  });

  it("marks an unregistered tag as foreign, carrying the Excel owner column as a fallback pending name", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000040", date: null, category: null, sex: null, ownerName: "Gómez", notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({
      status: "foreign",
      forced: false,
      ownerId: null,
      pendingOwnerName: "Gómez",
    });
  });

  it("marks a tag registered at a different farm as wrong_farm, with the owner inferred from its DICOSE", async () => {
    const { seededFarm: homeFarm, user } = await seedFarmUserRole("Campo San Antonio");
    const { seededFarm: otherFarm } = await seedFarmUserRole("Cuatro Cerros");
    const registeredOwner = await seedOwnTag("AR000000000041", homeFarm.id, user.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000041", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", otherFarm.id);

    expect(resolved).toMatchObject({
      status: "wrong_farm",
      ownerId: registeredOwner.id,
      registeredFarmId: homeFarm.id,
      registeredFarmName: "Campo San Antonio",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run __tests__/lib/activities/batch-resolution.test.ts`
Expected: FAIL — `resolveBatchRows` currently takes 2 arguments and knows nothing about `own_tag`/`dicose_registration`; multiple tests fail with wrong `status` or a TypeScript error about the missing third argument.

- [ ] **Step 3: Rewrite `batch-resolution.ts`**

Replace the full contents of `web/lib/activities/batch-resolution.ts`:

```ts
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, category, owner, ownTag, dicoseRegistration, farm } from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";
import { normalizeSex } from "@/lib/activities/sex-normalization";

export type ResolvedRow = { tag: string; eventDate: string; notes: string | null } & (
  | { status: "existing"; animalId: string; currentFarmId: string | null; currentPaddockId: string | null }
  | {
      status: "new";
      categoryId: string | null;
      sex: "male" | "female" | null;
      ownerId: string | null;
      pendingOwnerName: string | null;
    }
  | {
      status: "wrong_farm";
      categoryId: string | null;
      sex: "male" | "female" | null;
      ownerId: string;
      registeredFarmId: string;
      registeredFarmName: string;
    }
  | {
      status: "foreign";
      forced: boolean;
      categoryId: string | null;
      sex: "male" | "female" | null;
      ownerId: string | null;
      pendingOwnerName: string | null;
    }
  | { status: "error"; reason: string }
);

export type CreatableRow = Extract<ResolvedRow, { status: "new" | "wrong_farm" | "foreign" }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveEventDate(rowDate: string | null, formEventDate: string | null): string | null {
  if (rowDate && ISO_DATE.test(rowDate)) return rowDate;
  return formEventDate;
}

type CurrentStateRow = { current_farm_id: string | null; current_paddock_id: string | null; status: string };

export async function resolveBatchRows(
  rows: MappedRow[],
  formEventDate: string | null,
  operatingFarmId: string
): Promise<ResolvedRow[]> {
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

  const ownerRows = await db.select({ id: owner.id, name: owner.name }).from(owner);
  const ownerIdByName = new Map(ownerRows.map((o) => [o.name.trim().toLowerCase(), o.id]));

  const ownTagRows =
    nonEmptyTags.length > 0
      ? await db
          .select({
            tag: ownTag.tag,
            ownerId: dicoseRegistration.ownerId,
            farmId: dicoseRegistration.farmId,
            farmName: farm.name,
          })
          .from(ownTag)
          .innerJoin(dicoseRegistration, eq(dicoseRegistration.id, ownTag.dicoseRegistrationId))
          .innerJoin(farm, eq(farm.id, dicoseRegistration.farmId))
          .where(inArray(ownTag.tag, nonEmptyTags))
      : [];
  const ownTagByTag = new Map(ownTagRows.map((r) => [r.tag, r]));

  const result: ResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);
    const notes = row.notes;

    if (!eventDate) {
      result.push({ tag: row.tag, eventDate: "", notes, status: "error", reason: "Falta la fecha" });
      continue;
    }

    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }

    const animalId = animalIdByTag.get(row.tag);
    if (animalId) {
      const stateResult = await db.execute<CurrentStateRow>(
        sql`select current_farm_id, current_paddock_id, status from animal_current_state where animal_id = ${animalId}`
      );
      const state = stateResult.rows[0];
      if (state && state.status !== "alive") {
        result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "El animal está vendido o muerto" });
        continue;
      }
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "existing",
        animalId,
        currentFarmId: state?.current_farm_id ?? null,
        currentPaddockId: state?.current_paddock_id ?? null,
      });
      continue;
    }

    let categoryId: string | null = null;
    if (row.category) {
      const matchedCategoryId = categoryIdByName.get(row.category);
      if (!matchedCategoryId) {
        result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Categoría no reconocida" });
        continue;
      }
      categoryId = matchedCategoryId;
    }

    const sex = normalizeSex(row.sex);
    const ownTagMatch = ownTagByTag.get(row.tag);

    if (!ownTagMatch) {
      let ownerId: string | null = null;
      let pendingOwnerName: string | null = null;
      if (row.ownerName) {
        const matchedOwnerId = ownerIdByName.get(row.ownerName.trim().toLowerCase());
        if (matchedOwnerId) {
          ownerId = matchedOwnerId;
        } else {
          pendingOwnerName = row.ownerName.trim();
        }
      }
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "foreign",
        forced: false,
        categoryId,
        sex,
        ownerId,
        pendingOwnerName,
      });
      continue;
    }

    if (ownTagMatch.farmId === operatingFarmId) {
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "new",
        categoryId,
        sex,
        ownerId: ownTagMatch.ownerId,
        pendingOwnerName: null,
      });
    } else {
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "wrong_farm",
        categoryId,
        sex,
        ownerId: ownTagMatch.ownerId,
        registeredFarmId: ownTagMatch.farmId,
        registeredFarmName: ownTagMatch.farmName,
      });
    }
  }

  return result;
}
```

- [ ] **Step 4: Widen `createNewAnimal`'s accepted row type**

In `web/lib/activities/animal-creation.ts`, change the import and the `row` field's type:

```ts
import { animal, animalTagHistory, event, eventRetag, eventRecategorize } from "@/db/schema";
import type { CreatableRow } from "@/lib/activities/batch-resolution";
import type { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createNewAnimal(
  tx: Transaction,
  input: {
    userId: string;
    operatingFarmId: string;
    batchId: string;
    row: CreatableRow;
  }
): Promise<string> {
```

The rest of the function body is unchanged — `row.sex`, `row.ownerId`, `row.categoryId`, `row.tag`, `row.eventDate` all exist on every member of `CreatableRow`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run __tests__/lib/activities/batch-resolution.test.ts __tests__/lib/activities/animal-creation.test.ts`
Expected: PASS (17 tests in batch-resolution, existing animal-creation tests unaffected)

- [ ] **Step 6: Commit**

```bash
git add web/lib/activities/batch-resolution.ts web/lib/activities/animal-creation.ts \
  web/__tests__/lib/activities/batch-resolution.test.ts
git commit -m "feat: classify unregistered and misplaced caravanas in resolveBatchRows"
```

---

### Task 3: Wire the operating farm through preview, and confirm foreign/wrong-farm rows correctly

**Files:**
- Modify: `web/lib/activities/transfer.ts`
- Modify: `web/lib/activities/health.ts`
- Modify: `web/app/(protected)/activities/health/actions.ts`
- Modify: `web/app/(protected)/activities/transfer/actions.ts`
- Modify: `web/__tests__/activities/health-actions.test.ts`
- Modify: `web/__tests__/activities/transfer-actions.test.ts`

**Interfaces:**
- Consumes: `CreatableRow`, `resolveBatchRows` (Task 2).
- No new exports — `confirmTransferBatch`/`confirmHealthBatch`/`previewTransferBatch`/`previewHealthBatch` keep their existing signatures (the `rows: ResolvedRow[]` field already carries the new statuses since `ResolvedRow` changed in Task 2).

- [ ] **Step 1: Update `confirmTransferBatch` to skip unforced-foreign rows**

In `web/lib/activities/transfer.ts`, make these two changes:

Change the validation block:

```ts
  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }
  if (
    rows.some(
      (row) => (row.status === "new" || (row.status === "foreign" && row.forced)) && row.pendingOwnerName
    )
  ) {
    throw new Error("El lote tiene propietarios pendientes de crear; no se puede confirmar");
  }
```

Change the confirmation loop's first line:

```ts
    for (const row of rows) {
      if (row.status === "error") continue;
      if (row.status === "foreign" && !row.forced) continue;

      let animalId: string;
```

The rest of the loop body is unchanged — the `if (row.status === "existing")` / `else` branching already handles every other status via `createNewAnimal`.

- [ ] **Step 2: Apply the same two changes to `confirmHealthBatch`**

In `web/lib/activities/health.ts`, change the validation block:

```ts
  if (products.length === 0) {
    throw new Error("Hay que elegir al menos un producto");
  }
  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }
  if (
    rows.some(
      (row) => (row.status === "new" || (row.status === "foreign" && row.forced)) && row.pendingOwnerName
    )
  ) {
    throw new Error("El lote tiene propietarios pendientes de crear; no se puede confirmar");
  }
```

And the confirmation loop's first line:

```ts
    for (const row of rows) {
      if (row.status === "error") continue;
      if (row.status === "foreign" && !row.forced) continue;

      let animalId: string;
```

- [ ] **Step 3: Pass the operating farm into `previewHealthBatch`**

In `web/app/(protected)/activities/health/actions.ts`, change the start of `previewHealthBatch`:

```ts
export async function previewHealthBatch(formData: FormData): Promise<PreviewResult> {
  await requireSession();
  const operatingFarmId = await requireOperatingFarmId();

  const file = formData.get("file") as File;
```

And change the `resolveBatchRows` call further down:

```ts
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingFarmId);
```

- [ ] **Step 4: Pass the operating farm into `previewTransferBatch`**

In `web/app/(protected)/activities/transfer/actions.ts`, apply the same two changes: add `const operatingFarmId = await requireOperatingFarmId();` right after `await requireSession();` at the start of `previewTransferBatch`, and update its `resolveBatchRows` call to:

```ts
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingFarmId);
```

- [ ] **Step 5: Add the new test cases to `transfer-actions.test.ts`**

In `web/__tests__/activities/transfer-actions.test.ts`, add `owner, dicoseRegistration, ownTag` to the existing `@/db/schema` import:

```ts
import { role, farm, userAccount, userFarm, columnMapping, owner, dicoseRegistration, ownTag } from "@/db/schema";
```

Add this helper after `seedManagerSession`:

```ts
async function seedOwnTag(tag: string, farmId: string, userId: string, ownerName: string) {
  const [createdOwner] = await testDb.insert(owner).values({ name: ownerName }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: createdOwner.id, farmId, dicoseCode: "999999999" })
    .returning();
  await testDb.insert(ownTag).values({ tag, dicoseRegistrationId: registration.id, createdBy: userId });
  return createdOwner;
}
```

Update the existing test that asserts `status: "new"` for a freshly-uploaded tag — change:

```ts
  it("applies a submitted mapping and resolves rows without saving it yet", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000021"]]);
```

to:

```ts
  it("applies a submitted mapping and resolves rows without saving it yet", async () => {
    const { manager, seededFarm } = await seedManagerSession();
    await seedOwnTag("AR000000000021", seededFarm.id, manager.id, "AIP");
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000021"]]);
```

Add this test inside the `describe("previewTransferBatch", ...)` block (any position):

```ts
  it("marks an unregistered tag as foreign when there is no matching own_tag record", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000199"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      expect(result.rows[0].status).toBe("foreign");
    }
  });
```

Add these three tests inside the `describe("confirmTransferBatchAction", ...)` block:

```ts
  it("excludes an unforced foreign row from the confirmed batch", async () => {
    const { seededFarm } = await seedManagerSession();

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [
        {
          tag: "AR000000000024",
          eventDate: "2026-02-01",
          notes: null,
          status: "foreign",
          forced: false,
          categoryId: null,
          sex: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
    });

    const { animal } = await import("@/db/schema");
    const created = await testDb.select().from(animal);
    expect(created).toHaveLength(0);
  });

  it("creates the animal for a forced foreign row", async () => {
    const { seededFarm } = await seedManagerSession();

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [
        {
          tag: "AR000000000025",
          eventDate: "2026-02-01",
          notes: null,
          status: "foreign",
          forced: true,
          categoryId: null,
          sex: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
    });

    const { animal, animalTagHistory } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    const tagRows = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, createdAnimals[0].id));
    expect(tagRows[0].tag).toBe("AR000000000025");
  });

  it("confirms a wrong_farm row, creating the animal with its DICOSE-inferred owner", async () => {
    const { seededFarm } = await seedManagerSession();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: createdOwner.id, farmId: otherFarm.id, dicoseCode: "151518192" });

    await confirmTransferBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      destinationFarmId: seededFarm.id,
      destinationPaddockId: null,
      rows: [
        {
          tag: "AR000000000026",
          eventDate: "2026-02-01",
          notes: null,
          status: "wrong_farm",
          categoryId: null,
          sex: null,
          ownerId: createdOwner.id,
          registeredFarmId: otherFarm.id,
          registeredFarmName: "Cuatro Cerros",
        },
      ],
    });

    const { animal } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    expect(createdAnimals[0].ownerId).toBe(createdOwner.id);
  });
```

- [ ] **Step 6: Add the mirrored test cases to `health-actions.test.ts`**

In `web/__tests__/activities/health-actions.test.ts`, add `owner, dicoseRegistration, ownTag` to the existing `@/db/schema` import:

```ts
import { role, farm, userAccount, userFarm, product, columnMapping, owner, dicoseRegistration, ownTag } from "@/db/schema";
```

Add this helper after `seedManagerSession`:

```ts
async function seedOwnTag(tag: string, farmId: string, userId: string, ownerName: string) {
  const [createdOwner] = await testDb.insert(owner).values({ name: ownerName }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: createdOwner.id, farmId, dicoseCode: "999999999" })
    .returning();
  await testDb.insert(ownTag).values({ tag, dicoseRegistrationId: registration.id, createdBy: userId });
  return createdOwner;
}
```

Update the existing test that asserts `status: "new"` for a freshly-uploaded tag — change:

```ts
  it("applies a submitted mapping and resolves rows", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000081"]]);
```

to:

```ts
  it("applies a submitted mapping and resolves rows", async () => {
    const { manager, seededFarm } = await seedManagerSession();
    await seedOwnTag("AR000000000081", seededFarm.id, manager.id, "AIP");
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000081"]]);
```

Add this test inside the `describe("previewHealthBatch", ...)` block (any position):

```ts
  it("marks an unregistered tag as foreign when there is no matching own_tag record", async () => {
    await seedManagerSession();
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000299"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set("mapping", JSON.stringify([{ header: "IDE", meaning: "tag" }]));

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      expect(result.rows[0].status).toBe("foreign");
    }
  });
```

Add these three tests inside the `describe("confirmHealthBatchAction", ...)` block:

```ts
  it("excludes an unforced foreign row from the confirmed batch", async () => {
    await seedManagerSession();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
      ],
      rows: [
        {
          tag: "AR000000000084",
          eventDate: "2026-02-01",
          notes: null,
          status: "foreign",
          forced: false,
          categoryId: null,
          sex: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
    });

    const { animal } = await import("@/db/schema");
    const created = await testDb.select().from(animal);
    expect(created).toHaveLength(0);
  });

  it("creates the animal for a forced foreign row", async () => {
    await seedManagerSession();
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
      ],
      rows: [
        {
          tag: "AR000000000085",
          eventDate: "2026-02-01",
          notes: null,
          status: "foreign",
          forced: true,
          categoryId: null,
          sex: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
    });

    const { animal, animalTagHistory } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    const tagRows = await testDb
      .select()
      .from(animalTagHistory)
      .where(eq(animalTagHistory.animalId, createdAnimals[0].id));
    expect(tagRows[0].tag).toBe("AR000000000085");
  });

  it("confirms a wrong_farm row, creating the animal with its DICOSE-inferred owner", async () => {
    await seedManagerSession();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: createdOwner.id, farmId: otherFarm.id, dicoseCode: "151518192" });
    const [productA] = await testDb.insert(product).values({ name: "Ivermectina 1%" }).returning();

    await confirmHealthBatchAction({
      headerSignature: JSON.stringify(["IDE"]),
      mapping: [{ header: "IDE", meaning: "tag" }],
      products: [
        { productId: productA.id, dose: "10", doseUnit: "ml", route: "subcutánea", withdrawalDays: null, notes: null },
      ],
      rows: [
        {
          tag: "AR000000000086",
          eventDate: "2026-02-01",
          notes: null,
          status: "wrong_farm",
          categoryId: null,
          sex: null,
          ownerId: createdOwner.id,
          registeredFarmId: otherFarm.id,
          registeredFarmName: "Cuatro Cerros",
        },
      ],
    });

    const { animal } = await import("@/db/schema");
    const createdAnimals = await testDb.select().from(animal);
    expect(createdAnimals).toHaveLength(1);
    expect(createdAnimals[0].ownerId).toBe(createdOwner.id);
  });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd web && npx vitest run __tests__/activities/transfer-actions.test.ts __tests__/activities/health-actions.test.ts`
Expected: PASS (all existing tests plus the new ones)

- [ ] **Step 8: Commit**

```bash
git add web/lib/activities/transfer.ts web/lib/activities/health.ts \
  "web/app/(protected)/activities/health/actions.ts" "web/app/(protected)/activities/transfer/actions.ts" \
  web/__tests__/activities/transfer-actions.test.ts web/__tests__/activities/health-actions.test.ts
git commit -m "feat: confirm foreign/wrong_farm rows correctly, wire operatingFarmId into preview"
```

---

### Task 4: Preview table UI — show foreign/wrong-farm rows and let the user force them

**Files:**
- Modify: `web/components/activities/transfer-preview-table.tsx`
- Modify: `web/components/activities/health-form.tsx`
- Modify: `web/components/activities/transfer-form.tsx`
- Modify: `web/__tests__/components/health-form.test.tsx`
- Test: `web/__tests__/components/transfer-preview-table.test.tsx`

**Interfaces:**
- Consumes: `ResolvedRow` (Task 2).
- Produces: `TransferPreviewTable({ rows, onToggleForced }: { rows: ResolvedRow[]; onToggleForced: (tag: string) => void })` — the `onToggleForced` prop is new and required. `HealthForm`/`TransferForm` both pass it now.

- [ ] **Step 1: Write the failing test for the preview table's new statuses**

Read `web/__tests__/components/transfer-preview-table.test.tsx` first if it exists; if not, create it:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import type { ResolvedRow } from "@/lib/activities/transfer";

afterEach(cleanup);

describe("TransferPreviewTable", () => {
  it("labels a foreign row and lets the user force it via checkbox", async () => {
    const onToggleForced = vi.fn();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000050",
        eventDate: "2026-02-01",
        notes: null,
        status: "foreign",
        forced: false,
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    render(<TransferPreviewTable rows={rows} onToggleForced={onToggleForced} />);

    expect(screen.getByText("Ajena")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Es mía de todos modos"));
    expect(onToggleForced).toHaveBeenCalledWith("AR000000000050");
  });

  it("labels a wrong_farm row with its registered farm, and shows no checkbox", () => {
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000051",
        eventDate: "2026-02-01",
        notes: null,
        status: "wrong_farm",
        categoryId: null,
        sex: null,
        ownerId: "owner-1",
        registeredFarmId: "farm-1",
        registeredFarmName: "Cuatro Cerros",
      },
    ];

    render(<TransferPreviewTable rows={rows} onToggleForced={vi.fn()} />);

    expect(screen.getByText("Campo incorrecto")).toBeInTheDocument();
    expect(screen.getByText(/Registrada en Cuatro Cerros/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run __tests__/components/transfer-preview-table.test.tsx`
Expected: FAIL — `TransferPreviewTable` doesn't recognize `"foreign"`/`"wrong_farm"` statuses and doesn't accept `onToggleForced`.

- [ ] **Step 3: Rewrite `transfer-preview-table.tsx`**

Replace the full contents of `web/components/activities/transfer-preview-table.tsx`:

```tsx
import type { ResolvedRow } from "@/lib/activities/transfer";

function statusLabel(row: ResolvedRow): string {
  if (row.status === "existing") return "Existente";
  if (row.status === "new") return "Nuevo";
  if (row.status === "wrong_farm") return "Campo incorrecto";
  if (row.status === "foreign") return "Ajena";
  return "Error";
}

function detailText(row: ResolvedRow): string | null {
  if (row.status === "error") return row.reason;
  if (row.status === "new" && row.pendingOwnerName) return `Propietario pendiente: ${row.pendingOwnerName}`;
  if (row.status === "wrong_farm") return `Registrada en ${row.registeredFarmName} — verificar pastoreo`;
  if (row.status === "foreign" && row.pendingOwnerName) return `Propietario pendiente: ${row.pendingOwnerName}`;
  return null;
}

export function TransferPreviewTable({
  rows,
  onToggleForced,
}: {
  rows: ResolvedRow[];
  onToggleForced: (tag: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">Caravana</th>
          <th className="py-1 pr-2">Estado</th>
          <th className="py-1 pr-2">Detalle</th>
          <th className="py-1 pr-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.tag}</td>
            <td className="py-1 pr-2">{statusLabel(row)}</td>
            <td className="py-1 pr-2 text-muted-foreground">{detailText(row)}</td>
            <td className="py-1 pr-2">
              {row.status === "foreign" ? (
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={row.forced} onChange={() => onToggleForced(row.tag)} />
                  Es mía de todos modos
                </label>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run __tests__/components/transfer-preview-table.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire the checkbox and the "at least one confirmable row" rule into `HealthForm`**

In `web/components/activities/health-form.tsx`, replace the `pendingOwnerNames` function:

```ts
function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}
```

Replace `handleOwnerResolved`:

```ts
  function handleOwnerResolved(rawName: string, ownerId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.status === "new" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        if (r.status === "foreign" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        return r;
      })
    );
  }
```

Add this function right after `handleOwnerResolved`:

```ts
  function handleToggleForced(tag: string) {
    setRows((prev) => prev.map((r) => (r.status === "foreign" && r.tag === tag ? { ...r, forced: !r.forced } : r)));
  }
```

Right before the `return (` in `HealthForm`, add:

```ts
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_farm" || (r.status === "foreign" && r.forced)
  );
```

Change the `<TransferPreviewTable>` usage and the `Confirmar` button's `disabled`:

```tsx
          <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
          <Button
            type="button"
            disabled={
              rows.some((r) => r.status === "error") || hasIncompleteProduct || pendingNames.length > 0 || !hasConfirmableRow
            }
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
```

- [ ] **Step 6: Apply the same wiring to `TransferForm`**

In `web/components/activities/transfer-form.tsx`, replace `pendingOwnerNames`:

```ts
function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}
```

Replace `handleOwnerResolved`:

```ts
  function handleOwnerResolved(rawName: string, ownerId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.status === "new" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        if (r.status === "foreign" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        return r;
      })
    );
  }
```

Add right after it:

```ts
  function handleToggleForced(tag: string) {
    setRows((prev) => prev.map((r) => (r.status === "foreign" && r.tag === tag ? { ...r, forced: !r.forced } : r)));
  }
```

Right before the `return (` in `TransferForm`, add:

```ts
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_farm" || (r.status === "foreign" && r.forced)
  );
```

Change the `<TransferPreviewTable>` usage and the `Confirmar` button's `disabled`:

```tsx
          <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
          <Button
            type="button"
            disabled={rows.some((r) => r.status === "error") || !destinationFarmId || pendingNames.length > 0 || !hasConfirmableRow}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
```

- [ ] **Step 7: Fix `health-form.test.tsx`'s mocked preview result**

The existing mock in `web/__tests__/components/health-form.test.tsx` returns a row with `status: "new"`, which still matches the type unchanged — no edit needed there. Run the suite to confirm:

Run: `cd web && npx vitest run __tests__/components/health-form.test.tsx __tests__/components/transfer-form.test.tsx`
Expected: PASS — both forms compile and render with the new required `onToggleForced` prop supplied internally.

- [ ] **Step 8: Run the full unit suite**

Run: `cd web && npm test`
Expected: PASS, all test files.

- [ ] **Step 9: Commit**

```bash
git add web/components/activities/transfer-preview-table.tsx web/components/activities/health-form.tsx \
  web/components/activities/transfer-form.tsx web/__tests__/components/transfer-preview-table.test.tsx
git commit -m "feat: show foreign/wrong_farm rows in the preview table, let the user force a foreign row"
```

---

### Task 5: DICOSE registration settings page

**Files:**
- Create: `web/app/(protected)/settings/dicose/page.tsx`
- Create: `web/app/(protected)/settings/dicose/actions.ts`
- Create: `web/components/settings/dicose-registration-form.tsx`
- Modify: `web/components/app-shell.tsx`
- Modify: `web/lib/i18n/dictionaries.ts`
- Test: `web/__tests__/components/settings/dicose-registration-form.test.tsx`

**Interfaces:**
- Consumes: `listDicoseRegistrations`, `createDicoseRegistration`, `DicoseRegistrationEntry` (Task 1); `listOwners`, `OwnerCatalogEntry` from `@/lib/dal/owner-catalog` (existing).
- Produces: `DicoseRegistrationForm({ registrations, owners, farms }: { registrations: DicoseRegistrationEntry[]; owners: OwnerCatalogEntry[]; farms: { id: string; name: string }[] })`.

- [ ] **Step 1: Add the nav i18n keys**

In `web/lib/i18n/dictionaries.ts`, add to the `es` object (after `"appShell.navTransfer"`):

```ts
    "appShell.navDicose": "DICOSE",
```

And to the `en` object (after `"appShell.navTransfer"`):

```ts
    "appShell.navDicose": "DICOSE",
```

- [ ] **Step 2: Write the failing component test**

Create `web/__tests__/components/settings/dicose-registration-form.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DicoseRegistrationForm } from "@/components/settings/dicose-registration-form";
import { createDicoseRegistrationAction } from "@/app/(protected)/settings/dicose/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/dicose/actions", () => ({
  createDicoseRegistrationAction: vi.fn(),
}));

describe("DicoseRegistrationForm", () => {
  it("lists existing registrations and adds a new one", async () => {
    vi.mocked(createDicoseRegistrationAction).mockResolvedValue({
      id: "reg-2",
      ownerId: "owner-2",
      ownerName: "SASG",
      farmId: "farm-1",
      farmName: "Campo San Antonio",
      dicoseCode: "151422799",
    });

    render(
      <DicoseRegistrationForm
        registrations={[
          {
            id: "reg-1",
            ownerId: "owner-1",
            ownerName: "AIP",
            farmId: "farm-1",
            farmName: "Campo San Antonio",
            dicoseCode: "151400442",
          },
        ]}
        owners={[
          { id: "owner-1", name: "AIP" },
          { id: "owner-2", name: "SASG" },
        ]}
        farms={[{ id: "farm-1", name: "Campo San Antonio" }]}
      />
    );

    expect(screen.getByText("151400442")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Dueño"), "owner-2");
    await userEvent.selectOptions(screen.getByLabelText("Campo"), "farm-1");
    await userEvent.type(screen.getByLabelText("Código DICOSE"), "151422799");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("151422799")).toBeInTheDocument());
    expect(createDicoseRegistrationAction).toHaveBeenCalledWith({
      ownerId: "owner-2",
      farmId: "farm-1",
      dicoseCode: "151422799",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run __tests__/components/settings/dicose-registration-form.test.tsx`
Expected: FAIL with "Cannot find module '@/components/settings/dicose-registration-form'"

- [ ] **Step 3: Write the Server Actions**

Create `web/app/(protected)/settings/dicose/actions.ts`:

```ts
"use server";

import { asc } from "drizzle-orm";
import { requireSession } from "@/lib/dal/session";
import { db } from "@/db";
import { farm } from "@/db/schema";
import { createDicoseRegistration, type DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";

export async function listFarms(): Promise<{ id: string; name: string }[]> {
  await requireSession();
  return db.select({ id: farm.id, name: farm.name }).from(farm).orderBy(asc(farm.name));
}

export async function createDicoseRegistrationAction(input: {
  ownerId: string;
  farmId: string;
  dicoseCode: string;
}): Promise<DicoseRegistrationEntry> {
  await requireSession();
  return createDicoseRegistration(input);
}
```

- [ ] **Step 4: Write the client component**

Create `web/components/settings/dicose-registration-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDicoseRegistrationAction } from "@/app/(protected)/settings/dicose/actions";
import type { DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

export function DicoseRegistrationForm({
  registrations: initialRegistrations,
  owners,
  farms,
}: {
  registrations: DicoseRegistrationEntry[];
  owners: OwnerCatalogEntry[];
  farms: { id: string; name: string }[];
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [ownerId, setOwnerId] = useState("");
  const [farmId, setFarmId] = useState("");
  const [dicoseCode, setDicoseCode] = useState("");

  async function handleSubmit() {
    if (!ownerId || !farmId || !dicoseCode) return;
    const created = await createDicoseRegistrationAction({ ownerId, farmId, dicoseCode });
    setRegistrations((prev) => [...prev, created]);
    setDicoseCode("");
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Dueño</th>
            <th className="py-1 pr-2">Campo</th>
            <th className="py-1 pr-2">DICOSE</th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((registration) => (
            <tr key={registration.id} className="border-b last:border-0">
              <td className="py-1 pr-2">{registration.ownerName}</td>
              <td className="py-1 pr-2">{registration.farmName}</td>
              <td className="py-1 pr-2">{registration.dicoseCode}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dicose-owner">Dueño</Label>
        <select
          id="dicose-owner"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="h-8 rounded border px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>

        <Label htmlFor="dicose-farm">Campo</Label>
        <select
          id="dicose-farm"
          value={farmId}
          onChange={(e) => setFarmId(e.target.value)}
          className="h-8 rounded border px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name}
            </option>
          ))}
        </select>

        <Label htmlFor="dicose-code">Código DICOSE</Label>
        <Input id="dicose-code" value={dicoseCode} onChange={(e) => setDicoseCode(e.target.value)} />

        <Button type="button" disabled={!ownerId || !farmId || !dicoseCode} onClick={handleSubmit}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the page**

Create `web/app/(protected)/settings/dicose/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DicoseRegistrationForm } from "@/components/settings/dicose-registration-form";
import { listDicoseRegistrations } from "@/lib/dal/dicose-registration";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listFarms } from "@/app/(protected)/settings/dicose/actions";

export default async function DicoseSettingsPage() {
  const [registrations, owners, farms] = await Promise.all([listDicoseRegistrations(), listOwners(), listFarms()]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Registros DICOSE</CardTitle>
      </CardHeader>
      <CardContent>
        <DicoseRegistrationForm registrations={registrations} owners={owners} farms={farms} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Add the nav item**

In `web/components/app-shell.tsx`, add this entry to the `navItems` array, after the `"/activities/transfer"` entry:

```ts
  {
    href: "/settings/dicose",
    labelKey: "appShell.navDicose",
    isActive: (pathname) => pathname.startsWith("/settings/dicose"),
  },
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd web && npx vitest run __tests__/components/settings/dicose-registration-form.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 8: Commit**

```bash
git add web/lib/i18n/dictionaries.ts "web/app/(protected)/settings/dicose" \
  web/components/settings/dicose-registration-form.tsx web/components/app-shell.tsx \
  web/__tests__/components/settings/dicose-registration-form.test.tsx
git commit -m "feat: add DICOSE registration settings page"
```

---

### Task 6: Own-tag Excel upload settings page

**Files:**
- Create: `web/app/(protected)/settings/own-tags/page.tsx`
- Create: `web/app/(protected)/settings/own-tags/actions.ts`
- Create: `web/components/settings/own-tag-upload-form.tsx`
- Modify: `web/components/app-shell.tsx`
- Modify: `web/lib/i18n/dictionaries.ts`
- Test: `web/__tests__/components/settings/own-tag-upload-form.test.tsx`

**Interfaces:**
- Consumes: `listDicoseRegistrations`, `DicoseRegistrationEntry` (Task 1); `importOwnTags`, `countOwnTagsByRegistration`, `OwnTagImportResult` (Task 1); `parseExcelFile` from `@/lib/activities/excel-parsing` (existing).
- Produces: `OwnTagUploadForm({ registrations, counts }: { registrations: DicoseRegistrationEntry[]; counts: { registration: DicoseRegistrationEntry; count: number; lastUploadedAt: string | null }[] })`.

- [ ] **Step 1: Add the nav i18n key**

In `web/lib/i18n/dictionaries.ts`, add to the `es` object (after `"appShell.navDicose"`):

```ts
    "appShell.navOwnTags": "Caravanas propias",
```

And to the `en` object (after `"appShell.navDicose"`):

```ts
    "appShell.navOwnTags": "Own tags",
```

- [ ] **Step 2: Write the failing component test**

Create `web/__tests__/components/settings/own-tag-upload-form.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OwnTagUploadForm } from "@/components/settings/own-tag-upload-form";
import { uploadOwnTags } from "@/app/(protected)/settings/own-tags/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/own-tags/actions", () => ({
  uploadOwnTags: vi.fn(),
}));

const registration = {
  id: "reg-1",
  ownerId: "owner-1",
  ownerName: "AIP",
  farmId: "farm-1",
  farmName: "Campo San Antonio",
  dicoseCode: "151400442",
};

describe("OwnTagUploadForm", () => {
  it("uploads a file for the selected registration and shows the import result", async () => {
    vi.mocked(uploadOwnTags).mockResolvedValue({ inserted: 3, skipped: 1, invalid: 0 });

    render(
      <OwnTagUploadForm
        registrations={[registration]}
        counts={[{ registration, count: 10, lastUploadedAt: "2026-01-01T00:00:00.000Z" }]}
      />
    );

    expect(screen.getByText("10")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Registro DICOSE"), "reg-1");
    const file = new File(["tag\n100\n200"], "tags.xlsx");
    await userEvent.upload(screen.getByLabelText("Archivo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() =>
      expect(screen.getByText("3 caravanas nuevas cargadas, 1 ya existían, 0 filas inválidas ignoradas.")).toBeInTheDocument()
    );
    expect(uploadOwnTags).toHaveBeenCalledWith("reg-1", expect.any(FormData));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd web && npx vitest run __tests__/components/settings/own-tag-upload-form.test.tsx`
Expected: FAIL with "Cannot find module '@/components/settings/own-tag-upload-form'"

- [ ] **Step 4: Write the Server Actions**

Create `web/app/(protected)/settings/own-tags/actions.ts`:

```ts
"use server";

import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { importOwnTags, countOwnTagsByRegistration, type OwnTagImportResult } from "@/lib/dal/own-tag";
import { listDicoseRegistrations, type DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";

export async function uploadOwnTags(dicoseRegistrationId: string, formData: FormData): Promise<OwnTagImportResult> {
  const session = await requireSession();
  const file = formData.get("file") as File;
  const buffer = await file.arrayBuffer();
  const { rows } = await parseExcelFile(buffer);
  const rawValues = rows.map((row) => row[0] ?? "");
  return importOwnTags(dicoseRegistrationId, session.user.id, rawValues);
}

export async function listOwnTagCounts(): Promise<
  { registration: DicoseRegistrationEntry; count: number; lastUploadedAt: string | null }[]
> {
  await requireSession();
  const [registrations, counts] = await Promise.all([listDicoseRegistrations(), countOwnTagsByRegistration()]);
  const countByRegistrationId = new Map(counts.map((c) => [c.dicoseRegistrationId, c]));
  return registrations.map((registration) => {
    const match = countByRegistrationId.get(registration.id);
    return {
      registration,
      count: match?.count ?? 0,
      lastUploadedAt: match?.lastUploadedAt ? match.lastUploadedAt.toISOString() : null,
    };
  });
}
```

- [ ] **Step 5: Write the client component**

Create `web/components/settings/own-tag-upload-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadOwnTags } from "@/app/(protected)/settings/own-tags/actions";
import type { DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";
import type { OwnTagImportResult } from "@/lib/dal/own-tag";

type CountRow = { registration: DicoseRegistrationEntry; count: number; lastUploadedAt: string | null };

export function OwnTagUploadForm({
  registrations,
  counts: initialCounts,
}: {
  registrations: DicoseRegistrationEntry[];
  counts: CountRow[];
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [dicoseRegistrationId, setDicoseRegistrationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OwnTagImportResult | null>(null);

  async function handleUpload() {
    if (!dicoseRegistrationId || !file) return;
    const formData = new FormData();
    formData.set("file", file);
    const importResult = await uploadOwnTags(dicoseRegistrationId, formData);
    setResult(importResult);
    setCounts((prev) =>
      prev.map((row) =>
        row.registration.id === dicoseRegistrationId
          ? { ...row, count: row.count + importResult.inserted, lastUploadedAt: new Date().toISOString() }
          : row
      )
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Dueño</th>
            <th className="py-1 pr-2">Campo</th>
            <th className="py-1 pr-2">DICOSE</th>
            <th className="py-1 pr-2">Caravanas cargadas</th>
            <th className="py-1 pr-2">Última carga</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((row) => (
            <tr key={row.registration.id} className="border-b last:border-0">
              <td className="py-1 pr-2">{row.registration.ownerName}</td>
              <td className="py-1 pr-2">{row.registration.farmName}</td>
              <td className="py-1 pr-2">{row.registration.dicoseCode}</td>
              <td className="py-1 pr-2">{row.count}</td>
              <td className="py-1 pr-2">{row.lastUploadedAt ? new Date(row.lastUploadedAt).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-2">
        <Label htmlFor="own-tag-dicose">Registro DICOSE</Label>
        <select
          id="own-tag-dicose"
          value={dicoseRegistrationId}
          onChange={(e) => setDicoseRegistrationId(e.target.value)}
          className="h-8 rounded border px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {registrations.map((registration) => (
            <option key={registration.id} value={registration.id}>
              {registration.ownerName} — {registration.farmName} ({registration.dicoseCode})
            </option>
          ))}
        </select>

        <Label htmlFor="own-tag-file">Archivo</Label>
        <Input id="own-tag-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

        <Button type="button" disabled={!dicoseRegistrationId || !file} onClick={handleUpload}>
          Subir
        </Button>

        {result ? (
          <p className="text-sm text-muted-foreground">
            {result.inserted} caravanas nuevas cargadas, {result.skipped} ya existían, {result.invalid} filas
            inválidas ignoradas.
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

Create `web/app/(protected)/settings/own-tags/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnTagUploadForm } from "@/components/settings/own-tag-upload-form";
import { listOwnTagCounts } from "@/app/(protected)/settings/own-tags/actions";
import { listDicoseRegistrations } from "@/lib/dal/dicose-registration";

export default async function OwnTagsSettingsPage() {
  const [registrations, counts] = await Promise.all([listDicoseRegistrations(), listOwnTagCounts()]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Caravanas propias</CardTitle>
      </CardHeader>
      <CardContent>
        <OwnTagUploadForm registrations={registrations} counts={counts} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Add the nav item**

In `web/components/app-shell.tsx`, add this entry to the `navItems` array, after the `"/settings/dicose"` entry added in Task 5:

```ts
  {
    href: "/settings/own-tags",
    labelKey: "appShell.navOwnTags",
    isActive: (pathname) => pathname.startsWith("/settings/own-tags"),
  },
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd web && npx vitest run __tests__/components/settings/own-tag-upload-form.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 9: Run the full unit suite**

Run: `cd web && npm test`
Expected: PASS, all test files.

- [ ] **Step 10: Commit**

```bash
git add web/lib/i18n/dictionaries.ts "web/app/(protected)/settings/own-tags" \
  web/components/settings/own-tag-upload-form.tsx web/components/app-shell.tsx \
  web/__tests__/components/settings/own-tag-upload-form.test.tsx
git commit -m "feat: add own-tag Excel upload settings page"
```

---

### Task 7: Update existing E2E fixtures and add the end-to-end DICOSE/foreign-tag flow

**Files:**
- Modify: `web/e2e/global-setup.ts`
- Modify: `web/e2e/health-owner-inline-creation.spec.ts`
- Create: `web/e2e/dicose-foreign-tag.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6. No new exports.

- [ ] **Step 1: Register the tags already used by existing E2E fixtures**

The existing E2E fixtures (`transfer-lote.xlsx`, `health-lote.xlsx`, `health-two-products-lote.xlsx`) use tags `AR000000000099`, `AR000000000199`, `AR000000000299` and expect them to resolve as brand-new animals, exactly as before. Register them under a single E2E-only DICOSE at "Campo Norte" so that behavior is unchanged.

In `web/e2e/global-setup.ts`, add this block right after the existing `paddock` insert (before the closing `finally`):

```ts
    const {
      rows: [{ id: e2eOwnerId }],
    } = await client.query("insert into owner (name) values ('E2E Owner') returning id");
    const {
      rows: [{ id: dicoseRegistrationId }],
    } = await client.query(
      "insert into dicose_registration (owner_id, farm_id, dicose_code) values ($1, $2, '999999999') returning id",
      [e2eOwnerId, farmId]
    );
    for (const tag of ["AR000000000099", "AR000000000199", "AR000000000299"]) {
      await client.query(
        "insert into own_tag (tag, dicose_registration_id, created_by) values ($1, $2, (select id from user_account limit 1))",
        [tag, dicoseRegistrationId]
      );
    }
```

- [ ] **Step 2: Update `health-owner-inline-creation.spec.ts` for the now-foreign tags**

`health-owner-lote.xlsx`'s tags (`AR000000000399`, `AR000000000400`) are deliberately **not** registered above — this spec exists specifically to test owner-name resolution, which (per the design) only still applies to `"foreign"` rows. Both rows now need to be forced before confirming.

In `web/e2e/health-owner-inline-creation.spec.ts`, add this block right after the existing:

```ts
  await expect(page.getByText("AR000000000399")).toBeVisible();
  await expect(page.getByText("AR000000000400")).toBeVisible();
  await expect(page.getByText("Propietario pendiente: Propietario Nuevo")).toBeVisible();
```

insert:

```ts
  // Neither tag is registered in own_tag for this fixture — both rows are
  // "foreign" by design, since this spec exists to test owner-name matching,
  // which only still applies to foreign rows. Force both so they're included.
  const forceCheckboxes = page.getByLabel("Es mía de todos modos");
  await forceCheckboxes.nth(0).check();
  await forceCheckboxes.nth(1).check();
```

- [ ] **Step 3: Run the existing E2E suite to verify nothing broke**

Run: `cd web && npm run test:e2e`
Expected: PASS, all existing specs (global-setup's new seeding keeps `transfer-activity.spec.ts`, `transfer-destination-paddock.spec.ts`, `health-activity.spec.ts`, and `health-column-mapping-reopen.spec.ts` behaving exactly as before; `health-owner-inline-creation.spec.ts` passes with the two added checkbox clicks).

- [ ] **Step 4: Write the new end-to-end DICOSE/foreign-tag spec**

Create `web/e2e/dicose-foreign-tag.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

async function writeSingleColumnExcel(filePath: string, header: string, values: string[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow([header]);
  for (const value of values) sheet.addRow([value]);
  await workbook.xlsx.writeFile(filePath);
}

test("registers a DICOSE, loads its own tags, then flags a foreign tag during a transfer batch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/settings/dicose");
  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo").selectOption({ label: "Campo Norte" });
  await page.getByLabel("Código DICOSE").fill("151999888");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("151999888")).toBeVisible();

  await page.goto("/settings/own-tags");
  const ownTagsPath = path.join(os.tmpdir(), "own-tags-e2e.xlsx");
  await writeSingleColumnExcel(ownTagsPath, "Caravana", ["AR000000000500"]);
  await page.getByLabel("Registro DICOSE").selectOption({ label: "Pérez — Campo Norte (151999888)" });
  await page.getByLabel("Archivo").setInputFiles(ownTagsPath);
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(page.getByText(/1 caravanas nuevas cargadas/)).toBeVisible();

  await page.goto("/activities/transfer");
  const transferPath = path.join(os.tmpdir(), "transfer-foreign-e2e.xlsx");
  await writeSingleColumnExcel(transferPath, "CARAVANA_E2E", ["AR000000000500", "AR000000000501"]);
  await page.getByLabel(/archivo/i).setInputFiles(transferPath);
  await page.getByRole("button", { name: /^subir$/i }).click();

  await page.getByLabel("CARAVANA_E2E").selectOption("tag");
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.getByLabel("Fecha del lote").fill("2026-02-01");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("Nuevo")).toBeVisible();
  await expect(page.getByText("Ajena")).toBeVisible();

  await page.getByLabel("Es mía de todos modos").check();
  await page.getByLabel("Campo destino").selectOption({ label: "Campo Norte" });

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();

  fs.unlinkSync(ownTagsPath);
  fs.unlinkSync(transferPath);
});
```

- [ ] **Step 5: Run the new spec**

Run: `cd web && npm run test:e2e -- dicose-foreign-tag.spec.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Run the full E2E suite one more time**

Run: `cd web && npm run test:e2e`
Expected: PASS, every spec.

- [ ] **Step 7: Run the type checker**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors introduced by this feature (the pre-existing `Buffer`/`BlobPart` errors in `__tests__/activities/*.test.ts` are a known, unrelated issue).

- [ ] **Step 8: Commit**

```bash
git add web/e2e/global-setup.ts web/e2e/health-owner-inline-creation.spec.ts web/e2e/dicose-foreign-tag.spec.ts
git commit -m "test: cover the DICOSE registration and foreign-tag flow end to end"
```
