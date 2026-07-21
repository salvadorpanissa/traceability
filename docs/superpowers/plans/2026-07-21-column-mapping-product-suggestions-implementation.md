# Column Mapping Reopening + Product Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the column-mapping step reopen (pre-filled) whenever a saved mapping still has an "Ignorar" column, add a "Producto" column meaning to sanidad (multi-column), auto-suggest product rows from those columns' values, and let the user create a missing product inline from any row — as described in [`docs/superpowers/specs/2026-07-21-column-mapping-product-suggestions-design.md`](../specs/2026-07-21-column-mapping-product-suggestions-design.md).

**Architecture:** `ColumnMapper` becomes configurable (which meanings it offers, and an optional pre-filled starting mapping) rather than hardcoded to traslado's four meanings — traslado's own behavior doesn't change, sanidad opts into the extra "Producto" meaning. `previewTransferBatch`/`previewHealthBatch` gain a shared "is this mapping still incomplete" check that reopens the mapper instead of silently applying a saved mapping. Product-column extraction and catalog matching are pure/DAL functions consumed only by the health preview path — the transfer path is untouched beyond the reopening behavior it already shares.

**Tech Stack:** Same as the existing activity-loading stack — Drizzle, Next.js Server Actions, Vitest, Playwright. No new dependencies.

## Global Constraints

- All UI copy in Spanish.
- "Producto" is only offered as a column meaning for sanidad — traslado's `ColumnMapper` usage keeps its current four meanings (Caravana/Fecha/Categoría/Ignorar).
- A saved column mapping reopens the mapping step (pre-filled with the saved choices, not blank) whenever **any** of its columns is still `"ignore"`; if none are, it applies silently as before. This applies to both traslado and sanidad.
- Product-column values are read once per file (first non-empty value per mapped column, assumed uniform) — never varied per row. `resolveBatchRows`/`confirmHealthBatch` are not touched by this plan.
- Creating a product from the form only ever sets `name` — `defaultDoseUnit`/`defaultWithdrawalDays` stay `null`, editable per-batch in the row's own dose/unit/carencia fields like any other product.
- No new Playwright E2E spec is required for the existing `transfer-activity.spec.ts`/`health-activity.spec.ts` flows (their fixtures don't leave any column as "Ignorar"), but this plan adds one new E2E spec for the reopened-mapping + product-suggestion + inline-creation path, per the project's testing rule that every user-facing flow gets E2E coverage.

---

## Task 1: "Producto" column meaning + configurable `ColumnMapper`

**Files:**
- Modify: `web/lib/activities/column-mapping.ts`
- Modify: `web/components/activities/column-mapper.tsx`
- Modify: `web/__tests__/lib/activities/column-mapping.test.ts`
- Modify: `web/__tests__/components/*` — no existing `ColumnMapper`-specific test file exists yet; this task creates one.
- Create: `web/__tests__/components/column-mapper.test.tsx`

**Interfaces:**
- Produces: `ColumnMeaning` gains `"product"`. `ColumnMapper` gains two optional props: `availableMeanings?: ColumnMeaning[]` (defaults to `["tag", "date", "category", "ignore"]` — traslado's existing four, unchanged) and `initialMapping?: ColumnMapping[] | null` (pre-fills each header's `<select>` from the matching entry, falling back to `"ignore"` for any header not present in it).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing pure-logic test**

Modify `web/__tests__/lib/activities/column-mapping.test.ts` — add at the end of the file (after the existing `describe("applyColumnMapping", ...)` block):

```typescript
describe("ColumnMeaning", () => {
  it("includes product as a valid meaning", () => {
    const mapping: ColumnMapping = { header: "SANIDAD", meaning: "product" };
    expect(mapping.meaning).toBe("product");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- column-mapping.test.ts
```

Expected: FAIL — TypeScript error, `"product"` is not assignable to `ColumnMeaning`.

- [ ] **Step 3: Add `"product"` to `ColumnMeaning`**

Modify `web/lib/activities/column-mapping.ts` — change the type definition:

```typescript
export type ColumnMeaning = "tag" | "date" | "category" | "product" | "ignore";
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- column-mapping.test.ts
```

Expected: PASS, 5 tests (4 existing + 1 new).

- [ ] **Step 5: Write the failing `ColumnMapper` test**

Create `web/__tests__/components/column-mapper.test.tsx`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnMapper } from "@/components/activities/column-mapper";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup never registers —
// see __tests__/components/dashboard/livestock-status-table.test.tsx for
// the full explanation.
afterEach(cleanup);

describe("ColumnMapper", () => {
  it("only offers the default four meanings when availableMeanings is not passed", () => {
    render(<ColumnMapper headers={["IDE"]} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("option", { name: "Producto" })).not.toBeInTheDocument();
  });

  it("offers Producto when availableMeanings includes it, and allows it on more than one column", async () => {
    const onSubmit = vi.fn();
    render(
      <ColumnMapper
        headers={["IDE", "SANIDAD", "SANIDAD 2"]}
        availableMeanings={["tag", "date", "category", "product", "ignore"]}
        onSubmit={onSubmit}
      />
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("IDE"), "tag");
    await user.selectOptions(screen.getByLabelText("SANIDAD"), "product");
    await user.selectOptions(screen.getByLabelText("SANIDAD 2"), "product");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(onSubmit).toHaveBeenCalledWith([
      { header: "IDE", meaning: "tag" },
      { header: "SANIDAD", meaning: "product" },
      { header: "SANIDAD 2", meaning: "product" },
    ]);
  });

  it("pre-fills from initialMapping instead of defaulting every column to ignore", () => {
    render(
      <ColumnMapper
        headers={["IDE", "Fecha"]}
        initialMapping={[
          { header: "IDE", meaning: "tag" },
          { header: "Fecha", meaning: "ignore" },
        ]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("IDE")).toHaveValue("tag");
    expect(screen.getByLabelText("Fecha")).toHaveValue("ignore");
  });
});
```

- [ ] **Step 6: Run the test and confirm it fails**

```bash
npm run test -- column-mapper.test.tsx
```

Expected: FAIL — `availableMeanings`/`initialMapping` props don't exist yet, and "Producto" is never offered.

- [ ] **Step 7: Update `ColumnMapper`**

Modify `web/components/activities/column-mapper.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ColumnMapping, ColumnMeaning } from "@/lib/activities/column-mapping";

const MEANING_LABELS: Record<ColumnMeaning, string> = {
  tag: "Caravana",
  date: "Fecha",
  category: "Categoría",
  product: "Producto",
  ignore: "Ignorar",
};

const DEFAULT_MEANINGS: ColumnMeaning[] = ["tag", "date", "category", "ignore"];

export function ColumnMapper({
  headers,
  availableMeanings = DEFAULT_MEANINGS,
  initialMapping,
  onSubmit,
}: {
  headers: string[];
  availableMeanings?: ColumnMeaning[];
  initialMapping?: ColumnMapping[] | null;
  onSubmit: (mapping: ColumnMapping[]) => void;
}) {
  const [meanings, setMeanings] = useState<Record<string, ColumnMeaning>>(() =>
    Object.fromEntries(
      headers.map((h) => [h, initialMapping?.find((m) => m.header === h)?.meaning ?? "ignore"])
    )
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
            {availableMeanings.map((meaning) => (
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

- [ ] **Step 8: Run the test and confirm it passes**

```bash
npm run test -- column-mapper.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 9: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file — in particular `transfer-form.test.tsx` and `health-form.test.tsx`, whose `ColumnMapper` usage passes no new props and must keep working with the defaults.

- [ ] **Step 10: Commit**

```bash
git add lib/activities/column-mapping.ts components/activities/column-mapper.tsx __tests__/lib/activities/column-mapping.test.ts __tests__/components/column-mapper.test.tsx
git commit -m "feat: add Producto column meaning and make ColumnMapper configurable"
```

---

## Task 2: Reopen the mapping step when a column is still unconfigured

**Files:**
- Modify: `web/app/(protected)/activities/transfer/actions.ts`
- Modify: `web/app/(protected)/activities/health/actions.ts`
- Modify: `web/components/activities/transfer-form.tsx`
- Modify: `web/components/activities/health-form.tsx`
- Modify: `web/__tests__/activities/transfer-actions.test.ts`
- Modify: `web/__tests__/activities/health-actions.test.ts`

**Interfaces:**
- Produces: `PreviewResult`'s `mappingNeeded: true` variant gains `initialMapping: ColumnMapping[] | null` (in both `transfer/actions.ts` and `health/actions.ts` — each keeps its own local `PreviewResult` type, per the existing per-route convention). A saved mapping with any `"ignore"` entry now returns `{ mappingNeeded: true, headers, initialMapping: existing.mapping }` instead of applying silently.
- Consumes: nothing new from other tasks (Task 1's `ColumnMapper` already accepts `initialMapping`).

- [ ] **Step 1: Write the failing test for transfer**

Modify `web/__tests__/activities/transfer-actions.test.ts` — add inside `describe("previewTransferBatch", ...)`:

```typescript
  it("reopens the mapping step, pre-filled, when the saved mapping still has an ignored column", async () => {
    await seedManagerSession();
    await testDb.insert(columnMapping).values({
      headerSignature: JSON.stringify(["IDE", "SEXO"]),
      mapping: [
        { header: "IDE", meaning: "tag" },
        { header: "SEXO", meaning: "ignore" },
      ],
    });

    const buffer = await buildWorkbookBuffer(["IDE", "SEXO"], [["AR000000000100", "M"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(true);
    if (result.mappingNeeded) {
      expect(result.initialMapping).toEqual([
        { header: "IDE", meaning: "tag" },
        { header: "SEXO", meaning: "ignore" },
      ]);
    }
  });

  it("applies the saved mapping silently when no column is left ignored", async () => {
    await seedManagerSession();
    await testDb
      .insert(columnMapping)
      .values({ headerSignature: JSON.stringify(["IDE"]), mapping: [{ header: "IDE", meaning: "tag" }] });

    const buffer = await buildWorkbookBuffer(["IDE"], [["AR000000000101"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");

    const result = await previewTransferBatch(formData);
    expect(result.mappingNeeded).toBe(false);
  });
```

(`columnMapping` is already imported in this file for the existing tests — no new import needed. Check the top of the file: if `columnMapping` isn't imported yet, add it to the existing `import { role, farm, userAccount, userFarm } from "@/db/schema"` line.)

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- transfer-actions.test.ts
```

Expected: FAIL — the mapping applies silently regardless of any `"ignore"` entry (`mappingNeeded` is `false` in the first new test).

- [ ] **Step 3: Add the reopening check and update `previewTransferBatch`**

Modify `web/app/(protected)/activities/transfer/actions.ts`:

```typescript
export type PreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | { mappingNeeded: false; headerSignature: string; mapping: ColumnMapping[]; rows: ResolvedRow[] };

function hasUnconfiguredColumn(mapping: ColumnMapping[]): boolean {
  return mapping.some((m) => m.meaning === "ignore");
}
```

Replace the body of `previewTransferBatch` where it resolves `mapping`:

```typescript
  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    const [existing] = await db.select().from(columnMapping).where(eq(columnMapping.headerSignature, headerSignature));
    if (!existing) {
      return { mappingNeeded: true, headers, initialMapping: null };
    }
    const existingMapping = existing.mapping as ColumnMapping[];
    if (hasUnconfiguredColumn(existingMapping)) {
      return { mappingNeeded: true, headers, initialMapping: existingMapping };
    }
    mapping = existingMapping;
  }
```

(The rest of the function — `applyColumnMapping`/`resolveBatchRows`/the final return — is unchanged.)

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- transfer-actions.test.ts
```

Expected: PASS, 6 tests (4 existing + 2 new).

- [ ] **Step 5: Repeat Steps 1–4 for health**

Modify `web/__tests__/activities/health-actions.test.ts` — add the same two tests inside `describe("previewHealthBatch", ...)`, calling `previewHealthBatch` instead of `previewTransferBatch` (same bodies otherwise, same tag values `AR000000000100`/`AR000000000101` reused is fine since these are separate test files against a database that's reset in `beforeEach`).

Modify `web/app/(protected)/activities/health/actions.ts` with the identical `PreviewResult`/`hasUnconfiguredColumn` change and the identical `previewHealthBatch` body change shown in Step 3 (same code, same reasoning — sanidad's Server Action mirrors traslado's here).

```bash
npm run test -- health-actions.test.ts
```

Expected: PASS, 5 tests (3 existing + 2 new).

- [ ] **Step 6: Wire `initialMapping` through `TransferForm`**

Modify `web/components/activities/transfer-form.tsx` — change the `ColumnMapper` usage:

```typescript
      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          initialMapping={preview.initialMapping}
          onSubmit={(mapping) => runPreview(mapping)}
        />
      ) : null}
```

- [ ] **Step 7: Wire `initialMapping` through `HealthForm`**

Modify `web/components/activities/health-form.tsx` — same change, plus the `availableMeanings` prop for Producto (this task only wires `initialMapping`; Task 3 will need `availableMeanings` too, so make both changes here to avoid touching this block twice):

```typescript
      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "category", "product", "ignore"]}
          initialMapping={preview.initialMapping}
          onSubmit={(mapping) => runPreview(mapping)}
        />
      ) : null}
```

- [ ] **Step 8: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file.

- [ ] **Step 9: Commit**

```bash
git add "app/(protected)/activities/transfer/actions.ts" "app/(protected)/activities/health/actions.ts" components/activities/transfer-form.tsx components/activities/health-form.tsx __tests__/activities/transfer-actions.test.ts __tests__/activities/health-actions.test.ts
git commit -m "feat: reopen the column-mapping step when a saved mapping still has an ignored column"
```

---

## Task 3: Extract product-column values and suggest them in the health preview

**Files:**
- Modify: `web/lib/activities/column-mapping.ts`
- Modify: `web/app/(protected)/activities/health/actions.ts`
- Modify: `web/__tests__/lib/activities/column-mapping.test.ts`
- Modify: `web/__tests__/activities/health-actions.test.ts`

**Interfaces:**
- Produces: `extractProductColumnValues(headers: string[], rows: string[][], mapping: ColumnMapping[]): string[]` — one entry per column mapped to `"product"` (in mapping order), each the column's first non-empty, trimmed value across all rows; a mapped column with no non-empty value anywhere is skipped. `health/actions.ts`'s `PreviewResult`'s `mappingNeeded: false` variant gains `productSuggestions: { rawValue: string; matchedProductId: string | null }[]` — one entry per value `extractProductColumnValues` returns, `matchedProductId` set when a case-insensitive, trimmed match exists in `listProducts()`'s catalog, else `null`.
- Consumes: `listProducts` (`@/lib/dal/product-catalog`, already implemented).

- [ ] **Step 1: Write the failing test for `extractProductColumnValues`**

Modify `web/__tests__/lib/activities/column-mapping.test.ts` — add a new `describe` block:

```typescript
describe("extractProductColumnValues", () => {
  const headers = ["IDE", "SANIDAD", "SANIDAD 2"];
  const rows = [
    ["123456789012345", "ASPERSIN", "AFTOSA"],
    ["223456789012345", "ASPERSIN", "AFTOSA"],
  ];

  it("returns the first non-empty value for every column mapped as product, in mapping order", () => {
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "SANIDAD", meaning: "product" },
      { header: "SANIDAD 2", meaning: "product" },
    ];

    expect(extractProductColumnValues(headers, rows, mapping)).toEqual(["ASPERSIN", "AFTOSA"]);
  });

  it("skips a product column whose value is empty in every row", () => {
    const sparseRows = [
      ["123456789012345", "", "AFTOSA"],
      ["223456789012345", "", "AFTOSA"],
    ];
    const mapping: ColumnMapping[] = [
      { header: "IDE", meaning: "tag" },
      { header: "SANIDAD", meaning: "product" },
      { header: "SANIDAD 2", meaning: "product" },
    ];

    expect(extractProductColumnValues(headers, sparseRows, mapping)).toEqual(["AFTOSA"]);
  });

  it("returns an empty array when no column is mapped as product", () => {
    const mapping: ColumnMapping[] = [{ header: "IDE", meaning: "tag" }];
    expect(extractProductColumnValues(headers, rows, mapping)).toEqual([]);
  });
});
```

Add `extractProductColumnValues` to the existing import line at the top of the file: `import { computeHeaderSignature, applyColumnMapping, extractProductColumnValues, type ColumnMapping } from "@/lib/activities/column-mapping";`.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- column-mapping.test.ts
```

Expected: FAIL — `extractProductColumnValues` is not exported.

- [ ] **Step 3: Write the implementation**

Modify `web/lib/activities/column-mapping.ts` — add at the end of the file:

```typescript
export function extractProductColumnValues(headers: string[], rows: string[][], mapping: ColumnMapping[]): string[] {
  const productColumns = mapping.filter((m) => m.meaning === "product");
  const values: string[] = [];

  for (const column of productColumns) {
    const index = headers.indexOf(column.header);
    if (index < 0) continue;
    const firstNonEmpty = rows.map((row) => row[index]).find((value) => value && value.trim().length > 0);
    if (firstNonEmpty) {
      values.push(firstNonEmpty.trim());
    }
  }

  return values;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- column-mapping.test.ts
```

Expected: PASS, 8 tests (5 from Task 1 + 3 new).

- [ ] **Step 5: Write the failing test for `productSuggestions` in `previewHealthBatch`**

Modify `web/__tests__/activities/health-actions.test.ts` — add inside `describe("previewHealthBatch", ...)`:

```typescript
  it("suggests a product row per product-mapped column, matched against the catalog when possible", async () => {
    await seedManagerSession();
    const [matchedProduct] = await testDb.insert(product).values({ name: "Aftosa" }).returning();

    const buffer = await buildWorkbookBuffer(
      ["IDE", "SANIDAD", "SANIDAD 2"],
      [["AR000000000110", "ASPERSIN", "Aftosa"]]
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");
    formData.set("eventDate", "2026-02-01");
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "IDE", meaning: "tag" },
        { header: "SANIDAD", meaning: "product" },
        { header: "SANIDAD 2", meaning: "product" },
      ])
    );

    const result = await previewHealthBatch(formData);
    expect(result.mappingNeeded).toBe(false);
    if (!result.mappingNeeded) {
      expect(result.productSuggestions).toEqual([
        { rawValue: "ASPERSIN", matchedProductId: null },
        { rawValue: "Aftosa", matchedProductId: matchedProduct.id },
      ]);
    }
  });
```

- [ ] **Step 6: Run the test and confirm it fails**

```bash
npm run test -- health-actions.test.ts
```

Expected: FAIL — `result.productSuggestions` is `undefined`.

- [ ] **Step 7: Wire the suggestion computation into `previewHealthBatch`**

Modify `web/app/(protected)/activities/health/actions.ts`:

```typescript
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import {
  computeHeaderSignature,
  applyColumnMapping,
  extractProductColumnValues,
  type ColumnMapping,
} from "@/lib/activities/column-mapping";
import { listProducts } from "@/lib/dal/product-catalog";
```

```typescript
export type PreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | {
      mappingNeeded: false;
      headerSignature: string;
      mapping: ColumnMapping[];
      rows: ResolvedRow[];
      productSuggestions: { rawValue: string; matchedProductId: string | null }[];
    };
```

Replace the end of `previewHealthBatch` (from `const mappedRows = ...` to the final `return`):

```typescript
  const mappedRows = applyColumnMapping(headers, rows, mapping);
  const resolvedRows = await resolveBatchRows(mappedRows, eventDate);

  const productValues = extractProductColumnValues(headers, rows, mapping);
  const catalog = await listProducts();
  const productSuggestions = productValues.map((rawValue) => {
    const matched = catalog.find((entry) => entry.name.trim().toLowerCase() === rawValue.trim().toLowerCase());
    return { rawValue, matchedProductId: matched?.id ?? null };
  });

  return { mappingNeeded: false, headerSignature, mapping, rows: resolvedRows, productSuggestions };
```

- [ ] **Step 8: Run the test and confirm it passes**

```bash
npm run test -- health-actions.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 9: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file.

- [ ] **Step 10: Commit**

```bash
git add lib/activities/column-mapping.ts "app/(protected)/activities/health/actions.ts" __tests__/lib/activities/column-mapping.test.ts __tests__/activities/health-actions.test.ts
git commit -m "feat: suggest product rows from product-mapped Excel columns"
```

---

## Task 4: `createProductAction`

**Files:**
- Modify: `web/lib/dal/product-catalog.ts`
- Modify: `web/app/(protected)/activities/health/actions.ts`
- Modify: `web/__tests__/dal/product-catalog.test.ts`
- Modify: `web/__tests__/activities/health-actions.test.ts`

**Interfaces:**
- Produces: `createProduct(name: string): Promise<ProductCatalogEntry>` in `@/lib/dal/product-catalog` — inserts `{ name }` (`defaultDoseUnit`/`defaultWithdrawalDays` left `null` by the column defaults already in the schema), returns the created row shaped as `ProductCatalogEntry`. `createProductAction(name: string): Promise<ProductCatalogEntry>` in `web/app/(protected)/activities/health/actions.ts` — `requireSession()` then delegates to `createProduct`.
- Consumes: `product` (`@/db/schema`), `requireSession` (`@/lib/dal/session`, already imported in `health/actions.ts`).

- [ ] **Step 1: Write the failing DAL test**

Modify `web/__tests__/dal/product-catalog.test.ts` — add a new `describe` block:

```typescript
describe("createProduct", () => {
  it("creates a product with only a name, defaults left null", async () => {
    const created = await createProduct("Ivermectina 1%");

    expect(created.name).toBe("Ivermectina 1%");
    expect(created.defaultDoseUnit).toBeNull();
    expect(created.defaultWithdrawalDays).toBeNull();

    const [stored] = await testDb.select().from(product).where(eq(product.id, created.id));
    expect(stored.name).toBe("Ivermectina 1%");
  });

  it("rejects a duplicate name", async () => {
    await createProduct("Aftosa");
    await expect(createProduct("Aftosa")).rejects.toThrow();
  });
});
```

Add `eq` to the top-of-file `drizzle-orm` import (`import { eq } from "drizzle-orm";`) and update the module import to `const { listProducts, createProduct } = await import("@/lib/dal/product-catalog");`.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- product-catalog.test.ts
```

Expected: FAIL — `createProduct` is not exported.

- [ ] **Step 3: Write the implementation**

Modify `web/lib/dal/product-catalog.ts` — add at the end of the file:

```typescript
export async function createProduct(name: string): Promise<ProductCatalogEntry> {
  const [created] = await db.insert(product).values({ name }).returning();
  return {
    id: created.id,
    name: created.name,
    defaultDoseUnit: created.defaultDoseUnit,
    defaultWithdrawalDays: created.defaultWithdrawalDays,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- product-catalog.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing Server Action test**

Modify `web/__tests__/activities/health-actions.test.ts` — add a new `describe` block:

```typescript
describe("createProductAction", () => {
  it("creates a product and returns it", async () => {
    await seedManagerSession();

    const created = await createProductAction("Ivermectina 1%");

    expect(created.name).toBe("Ivermectina 1%");
    const [stored] = await testDb.select().from(product).where(eq(product.name, "Ivermectina 1%"));
    expect(stored).toBeDefined();
  });
});
```

Update the module import at the top of the file to include `createProductAction`:
`const { previewHealthBatch, confirmHealthBatchAction, createProductAction } = await import("../../app/(protected)/activities/health/actions");`.

- [ ] **Step 6: Run the test and confirm it fails**

```bash
npm run test -- health-actions.test.ts
```

Expected: FAIL — `createProductAction` is not exported.

- [ ] **Step 7: Write the implementation**

Modify `web/app/(protected)/activities/health/actions.ts`:

```typescript
import { listProducts, createProduct, type ProductCatalogEntry } from "@/lib/dal/product-catalog";
```

```typescript
export async function createProductAction(name: string): Promise<ProductCatalogEntry> {
  await requireSession();
  return createProduct(name);
}
```

- [ ] **Step 8: Run the test and confirm it passes**

```bash
npm run test -- health-actions.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 9: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file.

- [ ] **Step 10: Commit**

```bash
git add lib/dal/product-catalog.ts "app/(protected)/activities/health/actions.ts" __tests__/dal/product-catalog.test.ts __tests__/activities/health-actions.test.ts
git commit -m "feat: add createProductAction for inline product creation"
```

---

## Task 5: Wire suggestions and inline creation into the UI

**Files:**
- Modify: `web/components/activities/health-form.tsx`
- Modify: `web/components/activities/product-list-editor.tsx`
- Modify: `web/__tests__/components/health-form.test.tsx`

**Interfaces:**
- Produces: `ProductListEditor` gains two props — `suggestedNames?: (string | null)[]` (index-aligned with `products`; used only to pre-fill the "new product name" input the first time a row's select is switched to "create new") and `onCreateProduct: (name: string) => Promise<ProductCatalogEntry>`. `HealthForm` builds its initial `products`/`suggestedNames` state from `preview.productSuggestions` once a preview resolves (instead of always starting from a single empty row), holds `catalog` as local state seeded from the `catalog` prop, and passes a `handleCreateProduct` that calls `createProductAction`, appends the result to that local catalog state (so every row's dropdown sees it), and returns it to `ProductListEditor`.
- Consumes: `createProductAction`, `ProductCatalogEntry` (Task 4), `productSuggestions` (Task 3).

- [ ] **Step 1: Write the failing test**

Modify `web/__tests__/components/health-form.test.tsx` — change the mocked `previewHealthBatch` to include `productSuggestions`, and add a new test:

```typescript
vi.mock("@/app/(protected)/activities/health/actions", () => ({
  previewHealthBatch: vi.fn(async () => ({
    mappingNeeded: false,
    headerSignature: '["IDE"]',
    mapping: [{ header: "IDE", meaning: "tag" }],
    rows: [{ tag: "AR000000000090", eventDate: "2026-02-01", status: "new", categoryId: null }],
    productSuggestions: [{ rawValue: "Aftosa", matchedProductId: "p1" }],
  })),
  confirmHealthBatchAction: vi.fn(async () => undefined),
  createProductAction: vi.fn(async (name: string) => ({
    id: "p2",
    name,
    defaultDoseUnit: null,
    defaultWithdrawalDays: null,
  })),
}));
```

Add a new test inside `describe("HealthForm", ...)`:

```typescript
  it("pre-fills a product row from a matched suggestion, and creates a missing one inline", async () => {
    render(<HealthForm catalog={catalog} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    // The suggestion matched "Aftosa" (id p1, not in the initial catalog prop) —
    // HealthForm's mocked previewHealthBatch return above stands in for a real
    // catalog lookup, so the row should show it pre-selected.
    expect(screen.getByLabelText(/producto/i)).toHaveValue("p1");
  });
```

(This test only exercises the pre-fill path — the inline-creation UI itself is covered by `ProductListEditor`'s own test in Step 5 below, since `HealthForm` just passes `onCreateProduct` through without adding logic of its own beyond updating its catalog state.)

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web && npm run test -- health-form.test.tsx
```

Expected: FAIL — the product row still starts empty (`productId: ""`), since `HealthForm` doesn't read `productSuggestions` yet.

- [ ] **Step 3: Update `HealthForm`**

Modify `web/components/activities/health-form.tsx`:

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
  createProductAction,
  type PreviewResult,
} from "@/app/(protected)/activities/health/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { HealthProduct } from "@/lib/activities/health";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

function buildInitialProducts(
  suggestions: { rawValue: string; matchedProductId: string | null }[],
  catalog: ProductCatalogEntry[]
): { products: HealthProduct[]; suggestedNames: (string | null)[] } {
  if (suggestions.length === 0) {
    return { products: [emptyProduct()], suggestedNames: [null] };
  }
  const products = suggestions.map((s) => {
    const matched = s.matchedProductId ? catalog.find((c) => c.id === s.matchedProductId) : undefined;
    return {
      productId: s.matchedProductId ?? "",
      dose: "",
      doseUnit: matched?.defaultDoseUnit ?? "",
      route: "",
      withdrawalDays: matched?.defaultWithdrawalDays ?? null,
      notes: null,
    };
  });
  const suggestedNames = suggestions.map((s) => (s.matchedProductId ? null : s.rawValue));
  return { products, suggestedNames };
}

export function HealthForm({ catalog: initialCatalog }: { catalog: ProductCatalogEntry[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [catalog, setCatalog] = useState<ProductCatalogEntry[]>(initialCatalog);
  const [products, setProducts] = useState<HealthProduct[]>([emptyProduct()]);
  const [suggestedNames, setSuggestedNames] = useState<(string | null)[]>([null]);
  const [confirmed, setConfirmed] = useState(false);

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewHealthBatch(formData);
    setPreview(result);
    if (!result.mappingNeeded) {
      const built = buildInitialProducts(result.productSuggestions, catalog);
      setProducts(built.products);
      setSuggestedNames(built.suggestedNames);
    }
  }

  async function handleCreateProduct(name: string): Promise<ProductCatalogEntry> {
    const created = await createProductAction(name);
    setCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
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
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "category", "product", "ignore"]}
          initialMapping={preview.initialMapping}
          onSubmit={(mapping) => runPreview(mapping)}
        />
      ) : null}

      {preview && !preview.mappingNeeded ? (
        <div className="flex flex-col gap-4">
          <ProductListEditor
            catalog={catalog}
            products={products}
            suggestedNames={suggestedNames}
            onChange={setProducts}
            onCreateProduct={handleCreateProduct}
          />
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

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- health-form.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing `ProductListEditor` test**

Modify `web/components/activities/product-list-editor.tsx`'s test — no test file exists yet for it; create `web/__tests__/components/product-list-editor.test.tsx`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { HealthProduct } from "@/lib/activities/health";

afterEach(cleanup);

const catalog: ProductCatalogEntry[] = [
  { id: "p1", name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
];

describe("ProductListEditor", () => {
  it("creates a product inline, pre-filling the name from the row's suggestion", async () => {
    const products: HealthProduct[] = [emptyProduct()];
    const onChange = vi.fn();
    const onCreateProduct = vi.fn(async (name: string) => ({
      id: "p2",
      name,
      defaultDoseUnit: null,
      defaultWithdrawalDays: null,
    }));

    function Wrapper() {
      const [rows, setRows] = useState(products);
      return (
        <ProductListEditor
          catalog={catalog}
          products={rows}
          suggestedNames={["Aftosa"]}
          onChange={(next: HealthProduct[]) => {
            setRows(next);
            onChange(next);
          }}
          onCreateProduct={onCreateProduct}
        />
      );
    }

    render(<Wrapper />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/producto/i), "__create_new__");
    expect(screen.getByLabelText(/nombre del producto nuevo/i)).toHaveValue("Aftosa");

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(onCreateProduct).toHaveBeenCalledWith("Aftosa"));
    await waitFor(() => expect(screen.getByLabelText(/producto/i)).toHaveValue("p2"));
  });

  it("shows an error message if creation fails, without losing the typed name", async () => {
    const onCreateProduct = vi.fn(async () => {
      throw new Error("El nombre ya existe");
    });

    render(
      <ProductListEditor
        catalog={catalog}
        products={[emptyProduct()]}
        onChange={vi.fn()}
        onCreateProduct={onCreateProduct}
      />
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/producto/i), "__create_new__");
    await user.type(screen.getByLabelText(/nombre del producto nuevo/i), "Aftosa");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByText("El nombre ya existe")).toBeInTheDocument());
    expect(screen.getByLabelText(/nombre del producto nuevo/i)).toHaveValue("Aftosa");
  });
});
```

- [ ] **Step 6: Run the test and confirm it fails**

```bash
npm run test -- product-list-editor.test.tsx
```

Expected: FAIL — `ProductListEditor` doesn't accept `suggestedNames`/`onCreateProduct` yet, and there's no "+ Crear producto nuevo" option.

- [ ] **Step 7: Update `ProductListEditor`**

Modify `web/components/activities/product-list-editor.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { HealthProduct } from "@/lib/activities/health";

const CREATE_NEW_VALUE = "__create_new__";

function emptyProduct(): HealthProduct {
  return { productId: "", dose: "", doseUnit: "", route: "", withdrawalDays: null, notes: null };
}

export function ProductListEditor({
  catalog,
  products,
  suggestedNames,
  onChange,
  onCreateProduct,
}: {
  catalog: ProductCatalogEntry[];
  products: HealthProduct[];
  suggestedNames?: (string | null)[];
  onChange: (products: HealthProduct[]) => void;
  onCreateProduct: (name: string) => Promise<ProductCatalogEntry>;
}) {
  const [creatingRow, setCreatingRow] = useState<number | null>(null);
  const [newProductNameByRow, setNewProductNameByRow] = useState<Record<number, string>>({});
  const [createErrorByRow, setCreateErrorByRow] = useState<Record<number, string>>({});

  function updateRow(index: number, patch: Partial<HealthProduct>) {
    onChange(products.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function selectProduct(index: number, value: string) {
    if (value === CREATE_NEW_VALUE) {
      setCreatingRow(index);
      setNewProductNameByRow((prev) => ({ ...prev, [index]: prev[index] ?? suggestedNames?.[index] ?? "" }));
      return;
    }
    setCreatingRow(null);
    const catalogEntry = catalog.find((c) => c.id === value);
    const current = products[index];
    updateRow(index, {
      productId: value,
      doseUnit: current.doseUnit || catalogEntry?.defaultDoseUnit || "",
      withdrawalDays: current.withdrawalDays ?? catalogEntry?.defaultWithdrawalDays ?? null,
    });
  }

  async function handleCreateProduct(index: number) {
    const name = (newProductNameByRow[index] ?? "").trim();
    if (!name) return;
    setCreateErrorByRow((prev) => ({ ...prev, [index]: "" }));
    try {
      const created = await onCreateProduct(name);
      const current = products[index];
      updateRow(index, {
        productId: created.id,
        doseUnit: current.doseUnit || created.defaultDoseUnit || "",
        withdrawalDays: current.withdrawalDays ?? created.defaultWithdrawalDays ?? null,
      });
      setCreatingRow(null);
    } catch (error) {
      setCreateErrorByRow((prev) => ({
        ...prev,
        [index]: error instanceof Error ? error.message : "No se pudo crear el producto",
      }));
    }
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
              <option value={CREATE_NEW_VALUE}>+ Crear producto nuevo</option>
            </select>
          </div>
          {creatingRow === index ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`new-product-name-${index}`}>Nombre del producto nuevo</Label>
              <Input
                id={`new-product-name-${index}`}
                aria-label="Nombre del producto nuevo"
                value={newProductNameByRow[index] ?? ""}
                onChange={(e) => setNewProductNameByRow((prev) => ({ ...prev, [index]: e.target.value }))}
              />
              <Button type="button" size="sm" onClick={() => handleCreateProduct(index)}>
                Crear
              </Button>
              {createErrorByRow[index] ? (
                <p className="text-sm text-red-600">{createErrorByRow[index]}</p>
              ) : null}
            </div>
          ) : null}
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

- [ ] **Step 8: Run the test and confirm it passes**

```bash
npm run test -- product-list-editor.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 9: Run the full test suite and confirm no regressions**

```bash
npm run test
```

Expected: PASS, every test file.

- [ ] **Step 10: Run the build**

```bash
npm run build
```

Expected: compiles and type-checks cleanly.

- [ ] **Step 11: Commit**

```bash
git add components/activities/health-form.tsx components/activities/product-list-editor.tsx __tests__/components/health-form.test.tsx __tests__/components/product-list-editor.test.tsx
git commit -m "feat: pre-fill product rows from Excel suggestions, add inline product creation"
```

---

## Task 6: End-to-end test

**Files:**
- Create: `web/e2e/fixtures/health-two-products-lote.xlsx` (generated by a one-off script, see Step 1)
- Create: `web/e2e/health-column-mapping-reopen.spec.ts`

**Interfaces:**
- Consumes: the full stack built in Tasks 1–5, the seeded admin user, and the `Ivermectina 1%` product already seeded by `e2e/global-setup.ts` for the existing health E2E spec.

- [ ] **Step 1: Generate the fixture workbook**

```bash
cd web && node -e "
const ExcelJS = require('exceljs');
(async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['CARAVANA', 'PRODUCTO1', 'PRODUCTO2']);
  sheet.addRow(['AR000000000299', 'Ivermectina 1%', 'Antiparasitario Nuevo']);
  await workbook.xlsx.writeFile('e2e/fixtures/health-two-products-lote.xlsx');
})();
"
```

Expected: creates `web/e2e/fixtures/health-two-products-lote.xlsx` with three headers and one data row — `PRODUCTO1`'s value (`Ivermectina 1%`) matches the product already seeded by `global-setup.ts`; `PRODUCTO2`'s value (`Antiparasitario Nuevo`) matches nothing, exercising the inline-creation path.

- [ ] **Step 2: Write the E2E test**

Create `web/e2e/health-column-mapping-reopen.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("maps two product columns, gets a matched and an unmatched suggestion, and creates the missing product inline", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/activities/health");

  await page
    .getByLabel(/archivo/i)
    .setInputFiles(path.join(__dirname, "fixtures", "health-two-products-lote.xlsx"));
  await page.getByRole("button", { name: /^subir$/i }).click();

  // First time this header signature is seen: map CARAVANA to tag, both
  // product columns to Producto.
  await page.getByLabel("CARAVANA").selectOption("tag");
  await page.getByLabel("PRODUCTO1").selectOption("product");
  await page.getByLabel("PRODUCTO2").selectOption("product");
  await page.getByRole("button", { name: /continuar/i }).click();

  await expect(page.getByText("AR000000000299")).toBeVisible();

  // Row 1: matched "Ivermectina 1%" from the catalog already.
  const productSelects = page.getByLabel("Producto");
  await expect(productSelects.nth(0)).toHaveValue(/.+/);

  // Row 2: unmatched "Antiparasitario Nuevo" — create it inline.
  await expect(page.getByLabel("Nombre del producto nuevo")).toHaveValue("Antiparasitario Nuevo");
  await page.getByRole("button", { name: /^crear$/i }).click();
  await expect(page.getByLabel("Nombre del producto nuevo")).not.toBeVisible();

  await page.getByLabel("Dosis", { exact: true }).first().fill("10");
  await page.getByLabel("Vía").first().fill("subcutánea");
  await page.getByLabel("Dosis", { exact: true }).nth(1).fill("5");
  await page.getByLabel("Vía").nth(1).fill("oral");

  await page.getByRole("button", { name: /confirmar/i }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});
```

- [ ] **Step 3: Run the E2E test and confirm it passes**

```bash
cd web && export $(grep -v '^#' .env.local | xargs) && npm run test:e2e -- health-column-mapping-reopen.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full E2E suite to confirm no regressions**

```bash
npm run test:e2e
```

Expected: PASS, every spec file (`auth-flow.spec.ts`, `transfer-activity.spec.ts`, `health-activity.spec.ts`, `health-column-mapping-reopen.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add e2e/health-column-mapping-reopen.spec.ts e2e/fixtures/health-two-products-lote.xlsx
git commit -m "test: add end-to-end coverage for product-column mapping and inline product creation"
```

---

## Post-plan note

This plan closes the "mapeo de columna Producto" gap the sanidad spec had explicitly deferred, and fixes the column-mapping step never reopening once a mapping was saved. Deferred: reopening the mapper when a mapping has no `"ignore"` columns left but the user still wants to change something already assigned; editing or deleting a product once created; a catalog-management screen.
