# Configuración del campo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all farm administration (DICOSE, own tags, products, paddocks, categories) behind a single "Configuración del campo" entry point in the header's user menu, and complete CRUD (add edit) for the `product`, `category`, and `paddock` catalogs.

**Architecture:** A new `/settings` route group gets a persistent sidebar layout listing all five sections. The two existing pages (`/settings/dicose`, `/settings/own-tags`) move under it unchanged. Three new pages (`/settings/products`, `/settings/paddocks`, `/settings/categories`) are added following the exact same page/actions/form pattern already established by `dicose-registration-form.tsx`: a server component page loads data and renders a client form with a table of existing rows (now with inline edit) plus an add form below. The `product`, `category`, and `paddock` DAL modules gain `update*` functions alongside their existing `list*`/`create*`.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Drizzle ORM / Postgres, Vitest + Testing Library for unit/component tests, Playwright for E2E.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-farm-settings-hub-design.md` — read it before starting if anything below is ambiguous.
- No new UI dependency (no dialog/modal library) — editing happens inline in the table row, matching the codebase's existing minimal component set (`components/ui/{button,input,label,card}.tsx` only).
- The settings pages (`/settings/dicose`, `/settings/own-tags`, and the three new ones) do **not** use the i18n system (`useLocale`/`t()`) — they hardcode Spanish strings, exactly like the existing `dicose-registration-form.tsx` and `own-tag-upload-form.tsx` do. Only `components/app-shell.tsx` (the header) uses i18n — add the one new key there the same way the existing `appShell.*` keys are used.
- No `delete` for any catalog. No reassigning a paddock's `farmId` from the edit form.
- No role/permission restriction on any of these pages — same as DICOSE/own-tags today.
- Unique-name violations on create/edit must show a friendly inline message, not crash the form — see Task 4.
- Run `npm test` (vitest) from `web/` after every task's implementation step. Run `npm run test:e2e -- e2e/farm-settings-hub.spec.ts` only for Task 10.
- All file paths below are relative to `web/`.

---

### Task 1: Product catalog — add `updateProduct`, extend `createProduct`

**Files:**
- Modify: `lib/dal/product-catalog.ts`
- Modify: `__tests__/dal/product-catalog.test.ts`

**Interfaces:**
- Produces: `createProduct(name: string, options?: { defaultDoseUnit?: string | null; defaultWithdrawalDays?: number | null }): Promise<ProductCatalogEntry>` (extends the existing `createProduct(name)` signature — the `options` argument is optional so the existing caller in `app/(protected)/activities/health/actions.ts:119` keeps compiling unchanged).
- Produces: `updateProduct(id: string, input: { name: string; defaultDoseUnit?: string | null; defaultWithdrawalDays?: number | null }): Promise<ProductCatalogEntry>`.
- `ProductCatalogEntry` stays `{ id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }` (unchanged, already exported).

- [ ] **Step 1: Write the failing tests**

Replace the `createProduct` describe block and add an `updateProduct` describe block in `__tests__/dal/product-catalog.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { product } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listProducts, createProduct, updateProduct } = await import("@/lib/dal/product-catalog");

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

describe("createProduct", () => {
  it("creates a product with only a name, defaults left null", async () => {
    const created = await createProduct("Ivermectina 1%");

    expect(created.name).toBe("Ivermectina 1%");
    expect(created.defaultDoseUnit).toBeNull();
    expect(created.defaultWithdrawalDays).toBeNull();

    const [stored] = await testDb.select().from(product).where(eq(product.id, created.id));
    expect(stored.name).toBe("Ivermectina 1%");
  });

  it("creates a product with a dose unit and withdrawal days", async () => {
    const created = await createProduct("Aftosa", { defaultDoseUnit: "cc", defaultWithdrawalDays: 45 });

    expect(created).toEqual({
      id: expect.any(String),
      name: "Aftosa",
      defaultDoseUnit: "cc",
      defaultWithdrawalDays: 45,
    });
  });

  it("rejects a duplicate name", async () => {
    await createProduct("Aftosa");
    await expect(createProduct("Aftosa")).rejects.toThrow();
  });
});

describe("updateProduct", () => {
  it("updates name, dose unit, and withdrawal days", async () => {
    const created = await createProduct("Ivermectina 1%", { defaultDoseUnit: "ml", defaultWithdrawalDays: 21 });

    const updated = await updateProduct(created.id, {
      name: "Ivermectina 1% inyectable",
      defaultDoseUnit: "cc",
      defaultWithdrawalDays: 30,
    });

    expect(updated).toEqual({
      id: created.id,
      name: "Ivermectina 1% inyectable",
      defaultDoseUnit: "cc",
      defaultWithdrawalDays: 30,
    });
  });

  it("clears dose unit and withdrawal days when omitted", async () => {
    const created = await createProduct("Aftosa", { defaultDoseUnit: "cc", defaultWithdrawalDays: 45 });

    const updated = await updateProduct(created.id, { name: "Aftosa" });

    expect(updated.defaultDoseUnit).toBeNull();
    expect(updated.defaultWithdrawalDays).toBeNull();
  });

  it("rejects renaming into a name that already exists", async () => {
    await createProduct("Aftosa");
    const created = await createProduct("Ivermectina 1%");

    await expect(updateProduct(created.id, { name: "Aftosa" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- product-catalog`
Expected: FAIL — `updateProduct` is not exported, and the `{ defaultDoseUnit, defaultWithdrawalDays }` overload doesn't exist yet.

- [ ] **Step 3: Implement**

Replace the full contents of `lib/dal/product-catalog.ts`:

```ts
import { asc, eq } from "drizzle-orm";
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

export async function createProduct(
  name: string,
  options?: { defaultDoseUnit?: string | null; defaultWithdrawalDays?: number | null }
): Promise<ProductCatalogEntry> {
  const [created] = await db
    .insert(product)
    .values({
      name,
      defaultDoseUnit: options?.defaultDoseUnit ?? null,
      defaultWithdrawalDays: options?.defaultWithdrawalDays ?? null,
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    defaultDoseUnit: created.defaultDoseUnit,
    defaultWithdrawalDays: created.defaultWithdrawalDays,
  };
}

export async function updateProduct(
  id: string,
  input: { name: string; defaultDoseUnit?: string | null; defaultWithdrawalDays?: number | null }
): Promise<ProductCatalogEntry> {
  const [updated] = await db
    .update(product)
    .set({
      name: input.name,
      defaultDoseUnit: input.defaultDoseUnit ?? null,
      defaultWithdrawalDays: input.defaultWithdrawalDays ?? null,
    })
    .where(eq(product.id, id))
    .returning();
  return {
    id: updated.id,
    name: updated.name,
    defaultDoseUnit: updated.defaultDoseUnit,
    defaultWithdrawalDays: updated.defaultWithdrawalDays,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- product-catalog`
Expected: PASS (all `listProducts`/`createProduct`/`updateProduct` tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/dal/product-catalog.ts __tests__/dal/product-catalog.test.ts
git commit -m "feat: add updateProduct and optional dose/withdrawal fields on create"
```

---

### Task 2: Category catalog — add `updateCategory`, extend `createCategory`

**Files:**
- Modify: `lib/dal/category-catalog.ts`
- Create: `__tests__/dal/category-catalog.test.ts` (there is no dedicated DAL test file for this catalog yet — only an indirect schema-level test in `__tests__/schema/catalogs.test.ts`, which stays untouched)

**Interfaces:**
- Produces: `createCategory(name: string, sortOrder?: number): Promise<CategoryCatalogEntry>` (extends the existing `createCategory(name)` signature — `sortOrder` optional so the existing caller in `app/(protected)/settings/own-tags/actions.ts:89` keeps compiling unchanged).
- Produces: `updateCategory(id: string, input: { name: string; sortOrder: number }): Promise<CategoryCatalogEntry>`.
- `CategoryCatalogEntry` stays `{ id: string; name: string; sortOrder: number }` (unchanged, already exported).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/dal/category-catalog.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { category } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listCategories, createCategory, updateCategory } = await import("@/lib/dal/category-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listCategories", () => {
  it("lists every category ordered by sortOrder", async () => {
    await testDb.insert(category).values([
      { name: "Toro", sortOrder: 2 },
      { name: "Vaca", sortOrder: 1 },
    ]);

    const categories = await listCategories();

    expect(categories).toEqual([
      { id: expect.any(String), name: "Vaca", sortOrder: 1 },
      { id: expect.any(String), name: "Toro", sortOrder: 2 },
    ]);
  });
});

describe("createCategory", () => {
  it("creates a category with sortOrder defaulting to 0 when omitted", async () => {
    const created = await createCategory("Vaca");

    expect(created).toEqual({ id: expect.any(String), name: "Vaca", sortOrder: 0 });
  });

  it("creates a category with an explicit sortOrder", async () => {
    const created = await createCategory("Toro", 3);

    expect(created).toEqual({ id: expect.any(String), name: "Toro", sortOrder: 3 });
  });

  it("rejects a duplicate name", async () => {
    await createCategory("Vaca");
    await expect(createCategory("Vaca")).rejects.toThrow();
  });
});

describe("updateCategory", () => {
  it("updates name and sortOrder", async () => {
    const created = await createCategory("Vaca", 1);

    const updated = await updateCategory(created.id, { name: "Vaca de invernada", sortOrder: 5 });

    expect(updated).toEqual({ id: created.id, name: "Vaca de invernada", sortOrder: 5 });

    const [stored] = await testDb.select().from(category).where(eq(category.id, created.id));
    expect(stored.sortOrder).toBe(5);
  });

  it("rejects renaming into a name that already exists", async () => {
    await createCategory("Vaca");
    const created = await createCategory("Toro");

    await expect(updateCategory(created.id, { name: "Vaca", sortOrder: 0 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- category-catalog`
Expected: FAIL — new test file can't find `updateCategory`, and `createCategory("Toro", 3)` doesn't match the current one-argument signature.

- [ ] **Step 3: Implement**

Replace the full contents of `lib/dal/category-catalog.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { category } from "@/db/schema";

export type CategoryCatalogEntry = {
  id: string;
  name: string;
  sortOrder: number;
};

export async function listCategories(): Promise<CategoryCatalogEntry[]> {
  return db
    .select({ id: category.id, name: category.name, sortOrder: category.sortOrder })
    .from(category)
    .orderBy(asc(category.sortOrder));
}

export async function createCategory(name: string, sortOrder?: number): Promise<CategoryCatalogEntry> {
  const [created] = await db
    .insert(category)
    .values(sortOrder === undefined ? { name } : { name, sortOrder })
    .returning();
  return { id: created.id, name: created.name, sortOrder: created.sortOrder };
}

export async function updateCategory(
  id: string,
  input: { name: string; sortOrder: number }
): Promise<CategoryCatalogEntry> {
  const [updated] = await db
    .update(category)
    .set({ name: input.name, sortOrder: input.sortOrder })
    .where(eq(category.id, id))
    .returning();
  return { id: updated.id, name: updated.name, sortOrder: updated.sortOrder };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- category-catalog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dal/category-catalog.ts __tests__/dal/category-catalog.test.ts
git commit -m "feat: add updateCategory and explicit sortOrder on create"
```

---

### Task 3: Paddock catalog — add `updatePaddock`

**Files:**
- Modify: `lib/dal/paddock-catalog.ts`
- Modify: `__tests__/dal/paddock-catalog.test.ts`

**Interfaces:**
- Produces: `updatePaddock(id: string, name: string): Promise<PaddockCatalogEntry>` (only the name is editable — `farmId` is intentionally not part of the input, per the spec's decision not to let this screen move a paddock between farms).
- `PaddockCatalogEntry` stays `{ id: string; name: string; farmId: string }` (unchanged, already exported). `listPaddocksByFarm`, `listPaddocksForFarms`, `createPaddock` are unchanged.

- [ ] **Step 1: Write the failing test**

Add to the bottom of `__tests__/dal/paddock-catalog.test.ts` (keep everything already in the file, add this new import and describe block):

```ts
const { listPaddocksByFarm, listPaddocksForFarms, createPaddock, updatePaddock } = await import(
  "@/lib/dal/paddock-catalog"
);
```

Replace the existing `const { listPaddocksByFarm, listPaddocksForFarms, createPaddock } = await import("@/lib/dal/paddock-catalog");` line with the one above, then append at the end of the file:

```ts
describe("updatePaddock", () => {
  it("renames a paddock", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const created = await createPaddock(seededFarm.id, "Potrero 1");

    const updated = await updatePaddock(created.id, "Potrero 1 (bajo)");

    expect(updated).toEqual({ id: created.id, name: "Potrero 1 (bajo)", farmId: seededFarm.id });
  });

  it("rejects renaming into a name that already exists within the same farm", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    await createPaddock(seededFarm.id, "Potrero 1");
    const created = await createPaddock(seededFarm.id, "Potrero 2");

    await expect(updatePaddock(created.id, "Potrero 1")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- paddock-catalog`
Expected: FAIL — `updatePaddock` is not exported.

- [ ] **Step 3: Implement**

In `lib/dal/paddock-catalog.ts`, add this function after `createPaddock`:

```ts
export async function updatePaddock(id: string, name: string): Promise<PaddockCatalogEntry> {
  const [updated] = await db.update(paddock).set({ name }).where(eq(paddock.id, id)).returning();
  return { id: updated.id, name: updated.name, farmId: updated.farmId };
}
```

(`eq` is already imported at the top of the file — no import changes needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- paddock-catalog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dal/paddock-catalog.ts __tests__/dal/paddock-catalog.test.ts
git commit -m "feat: add updatePaddock"
```

---

### Task 4: Shared unique-violation helper

**Files:**
- Create: `lib/dal/unique-violation.ts`
- Create: `__tests__/dal/unique-violation.test.ts`

**Interfaces:**
- Produces: `isUniqueViolationError(error: unknown): boolean` — used by the three new `actions.ts` files in Tasks 7–9 to turn a Postgres unique-constraint violation (`error.code === "23505"`, the `pg` driver's standard code) into a friendly inline message instead of an unhandled rejection.

- [ ] **Step 1: Write the failing test**

Create `__tests__/dal/unique-violation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

describe("isUniqueViolationError", () => {
  it("is true for a Postgres unique_violation error (code 23505)", () => {
    expect(isUniqueViolationError({ code: "23505" })).toBe(true);
  });

  it("is false for other error shapes", () => {
    expect(isUniqueViolationError({ code: "23503" })).toBe(false);
    expect(isUniqueViolationError(new Error("boom"))).toBe(false);
    expect(isUniqueViolationError(null)).toBe(false);
    expect(isUniqueViolationError(undefined)).toBe(false);
    expect(isUniqueViolationError("boom")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- unique-violation`
Expected: FAIL — module `@/lib/dal/unique-violation` doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/dal/unique-violation.ts`:

```ts
// The `pg` driver reports a unique-constraint violation as error.code "23505"
// (Postgres' unique_violation SQLSTATE) — used to turn a duplicate-name
// insert/update into a friendly message instead of an unhandled rejection.
export function isUniqueViolationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- unique-violation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dal/unique-violation.ts __tests__/dal/unique-violation.test.ts
git commit -m "feat: add isUniqueViolationError helper"
```

---

### Task 5: Header nav — "Configuración del campo" menu item

**Files:**
- Modify: `components/app-shell.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Modify: `__tests__/app-shell.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a link with accessible name "Configuración del campo" (es) / "Farm settings" (en) inside the user menu, `href="/settings"`. Task 6's sidebar/layout is what that link resolves to.

- [ ] **Step 1: Write the failing test**

Replace the test body in `__tests__/app-shell.test.tsx` (keep the imports/mocks at the top unchanged) with:

```tsx
describe("AppShell", () => {
  it("shows navigation, user name, and the user menu items", async () => {
    mockedPathname = "/activities/health";

    render(
      <LocaleProvider initialLocale="es">
        <AppShell userName="Encargado Norte">
          <p>contenido</p>
        </AppShell>
      </LocaleProvider>
    );

    const user = userEvent.setup();
    const userButton = screen.getByRole("button", { name: "Menú de usuario" });
    const activeNavLink = screen.getByRole("link", { name: "Sanidades" });

    expect(screen.getByText("settings-menu")).toBeInTheDocument();
    expect(activeNavLink).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Registro de Caravanas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();

    await user.click(userButton);

    const settingsLink = screen.getByRole("link", { name: "Configuración del campo" });
    expect(settingsLink).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app-shell`
Expected: FAIL — no link named "Configuración del campo" exists yet, and "Registro de Caravanas" is still present in `navItems`.

- [ ] **Step 3: Implement**

In `lib/i18n/dictionaries.ts`, add one key to the `es` block right after `"appShell.navRegisterTags": "Registro de Caravanas",`:

```ts
    "appShell.navFarmSettings": "Configuración del campo",
```

and the matching key to the `en` block right after `"appShell.navRegisterTags": "Register tags",`:

```ts
    "appShell.navFarmSettings": "Farm settings",
```

In `components/app-shell.tsx`, remove the own-tags entry from `navItems` (it becomes):

```ts
const navItems: NavItem[] = [
  {
    href: "/activities/health",
    labelKey: "appShell.navHealth",
    isActive: (pathname) => pathname.startsWith("/activities/health"),
  },
  {
    href: "/activities/transfer",
    labelKey: "appShell.navTransfer",
    isActive: (pathname) => pathname.startsWith("/activities/transfer"),
  },
];
```

Then add the settings link inside the user menu dropdown, right before `<LogoutButton className="w-full justify-start" />`:

```tsx
              {isUserMenuOpen ? (
                <div className="absolute right-0 z-10 mt-2 min-w-40 rounded-md border bg-background p-1 shadow-md">
                  <Link
                    href="/settings"
                    onClick={() => {
                      setIsMobileNavOpen(false);
                      setIsUserMenuOpen(false);
                    }}
                    className="block rounded-md px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted"
                  >
                    {t("appShell.navFarmSettings")}
                  </Link>
                  <LogoutButton className="w-full justify-start" />
                </div>
              ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app-shell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/app-shell.tsx lib/i18n/dictionaries.ts __tests__/app-shell.test.tsx
git commit -m "feat: add Configuración del campo to the user menu, drop own-tags from top nav"
```

---

### Task 6: `/settings` sidebar layout + index redirect

**Files:**
- Create: `components/settings/settings-sidebar.tsx`
- Create: `__tests__/components/settings/settings-sidebar.test.tsx`
- Create: `app/(protected)/settings/layout.tsx`
- Create: `app/(protected)/settings/page.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone nav component).
- Produces: `SettingsSidebar` (default-exportless named export, client component, no props) rendering links to `/settings/dicose`, `/settings/own-tags`, `/settings/products`, `/settings/paddocks`, `/settings/categories`. `SettingsLayout` wraps `{children}` with the sidebar. `/settings` itself redirects to `/settings/dicose`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/settings/settings-sidebar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";

let mockedPathname = "/settings/dicose";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
}));

afterEach(cleanup);

describe("SettingsSidebar", () => {
  it("lists every settings section and marks the current one as active", () => {
    mockedPathname = "/settings/products";

    render(<SettingsSidebar />);

    expect(screen.getByRole("link", { name: "DICOSE" })).toHaveAttribute("href", "/settings/dicose");
    expect(screen.getByRole("link", { name: "Caravanas propias" })).toHaveAttribute("href", "/settings/own-tags");
    expect(screen.getByRole("link", { name: "Potreros" })).toHaveAttribute("href", "/settings/paddocks");
    expect(screen.getByRole("link", { name: "Categorías" })).toHaveAttribute("href", "/settings/categories");

    expect(screen.getByRole("link", { name: "Productos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Potreros" })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- settings-sidebar`
Expected: FAIL — `@/components/settings/settings-sidebar` doesn't exist.

- [ ] **Step 3: Implement**

Create `components/settings/settings-sidebar.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsNavItem = { href: string; label: string };

const settingsNavItems: SettingsNavItem[] = [
  { href: "/settings/dicose", label: "DICOSE" },
  { href: "/settings/own-tags", label: "Caravanas propias" },
  { href: "/settings/products", label: "Productos" },
  { href: "/settings/paddocks", label: "Potreros" },
  { href: "/settings/categories", label: "Categorías" },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:w-48 md:shrink-0">
      <Button
        type="button"
        variant="ghost"
        className="mb-2 gap-2 md:hidden"
        aria-expanded={isOpen}
        aria-controls="settings-navigation"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {isOpen ? <X /> : <Menu />}
        Configuración del campo
      </Button>

      <nav
        id="settings-navigation"
        aria-label="Configuración del campo"
        className={cn("flex-col gap-1 md:flex", isOpen ? "flex" : "hidden")}
      >
        {settingsNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setIsOpen(false)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "bg-muted text-foreground" : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

Create `app/(protected)/settings/layout.tsx`:

```tsx
import { SettingsSidebar } from "@/components/settings/settings-sidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 md:flex-row">
      <SettingsSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

Create `app/(protected)/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function SettingsIndexPage() {
  redirect("/settings/dicose");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- settings-sidebar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/settings/settings-sidebar.tsx __tests__/components/settings/settings-sidebar.test.tsx "app/(protected)/settings/layout.tsx" "app/(protected)/settings/page.tsx"
git commit -m "feat: add /settings sidebar layout and index redirect"
```

---

### Task 7: Products settings page

**Files:**
- Create: `app/(protected)/settings/products/actions.ts`
- Create: `app/(protected)/settings/products/page.tsx`
- Create: `components/settings/product-catalog-form.tsx`
- Create: `__tests__/components/settings/product-catalog-form.test.tsx`

**Interfaces:**
- Consumes: `listProducts`, `createProduct`, `updateProduct`, `ProductCatalogEntry` from `@/lib/dal/product-catalog` (Task 1); `isUniqueViolationError` from `@/lib/dal/unique-violation` (Task 4); `requireSession` from `@/lib/dal/session`.
- Produces: `createProductAction`, `updateProductAction` — both return `ProductCatalogActionResult = { ok: true; entry: ProductCatalogEntry } | { ok: false; error: string }`. `ProductCatalogForm` client component with props `{ products: ProductCatalogEntry[] }`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/settings/product-catalog-form.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductCatalogForm } from "@/components/settings/product-catalog-form";
import { createProductAction, updateProductAction } from "@/app/(protected)/settings/products/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/products/actions", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}));

describe("ProductCatalogForm", () => {
  it("lists products, adds a new one, and edits an existing one", async () => {
    vi.mocked(createProductAction).mockResolvedValue({
      ok: true,
      entry: { id: "prod-2", name: "Aftosa", defaultDoseUnit: null, defaultWithdrawalDays: null },
    });
    vi.mocked(updateProductAction).mockResolvedValue({
      ok: true,
      entry: { id: "prod-1", name: "Ivermectina 1% inyectable", defaultDoseUnit: "cc", defaultWithdrawalDays: 21 },
    });

    render(
      <ProductCatalogForm
        products={[{ id: "prod-1", name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 }]}
      />
    );

    expect(screen.getByText("Ivermectina 1%")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nombre"), "Aftosa");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Aftosa")).toBeInTheDocument());
    expect(createProductAction).toHaveBeenCalledWith({
      name: "Aftosa",
      defaultDoseUnit: null,
      defaultWithdrawalDays: null,
    });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editNameInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "Ivermectina 1% inyectable");
    const editDoseUnitInput = screen.getByLabelText("Editar unidad de dosis");
    await userEvent.clear(editDoseUnitInput);
    await userEvent.type(editDoseUnitInput, "cc");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateProductAction).toHaveBeenCalledWith({
        id: "prod-1",
        name: "Ivermectina 1% inyectable",
        defaultDoseUnit: "cc",
        defaultWithdrawalDays: 21,
      })
    );
    expect(screen.getByText("Ivermectina 1% inyectable")).toBeInTheDocument();
  });

  it("shows an inline error and keeps the form when the name is a duplicate", async () => {
    vi.mocked(createProductAction).mockResolvedValue({ ok: false, error: "Ya existe un producto con ese nombre" });

    render(<ProductCatalogForm products={[]} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Aftosa");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Ya existe un producto con ese nombre")).toBeInTheDocument());
    expect(screen.queryByText("Aftosa")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- product-catalog-form`
Expected: FAIL — neither `@/components/settings/product-catalog-form` nor `@/app/(protected)/settings/products/actions` exist yet.

- [ ] **Step 3: Implement**

Create `app/(protected)/settings/products/actions.ts`:

```ts
"use server";

import { requireSession } from "@/lib/dal/session";
import { createProduct, updateProduct, type ProductCatalogEntry } from "@/lib/dal/product-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type ProductCatalogActionResult = { ok: true; entry: ProductCatalogEntry } | { ok: false; error: string };

export async function createProductAction(input: {
  name: string;
  defaultDoseUnit: string | null;
  defaultWithdrawalDays: number | null;
}): Promise<ProductCatalogActionResult> {
  await requireSession();
  try {
    const entry = await createProduct(input.name, {
      defaultDoseUnit: input.defaultDoseUnit,
      defaultWithdrawalDays: input.defaultWithdrawalDays,
    });
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un producto con ese nombre" };
    throw error;
  }
}

export async function updateProductAction(input: {
  id: string;
  name: string;
  defaultDoseUnit: string | null;
  defaultWithdrawalDays: number | null;
}): Promise<ProductCatalogActionResult> {
  await requireSession();
  try {
    const entry = await updateProduct(input.id, input);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un producto con ese nombre" };
    throw error;
  }
}
```

Create `components/settings/product-catalog-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProductAction, updateProductAction } from "@/app/(protected)/settings/products/actions";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

export function ProductCatalogForm({ products: initialProducts }: { products: ProductCatalogEntry[] }) {
  const [products, setProducts] = useState(initialProducts);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDoseUnit, setEditDoseUnit] = useState("");
  const [editWithdrawalDays, setEditWithdrawalDays] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [doseUnit, setDoseUnit] = useState("");
  const [withdrawalDays, setWithdrawalDays] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(entry: ProductCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditDoseUnit(entry.defaultDoseUnit ?? "");
    setEditWithdrawalDays(entry.defaultWithdrawalDays?.toString() ?? "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editName) return;
    const result = await updateProductAction({
      id,
      name: editName,
      defaultDoseUnit: editDoseUnit || null,
      defaultWithdrawalDays: editWithdrawalDays ? Number(editWithdrawalDays) : null,
    });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? result.entry : p)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!name) return;
    const result = await createProductAction({
      name,
      defaultDoseUnit: doseUnit || null,
      defaultWithdrawalDays: withdrawalDays ? Number(withdrawalDays) : null,
    });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setProducts((prev) => [...prev, result.entry]);
    setName("");
    setDoseUnit("");
    setWithdrawalDays("");
    setCreateError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Unidad de dosis</th>
            <th className="py-1 pr-2">Días de retiro</th>
            <th className="py-1 pr-2" />
          </tr>
        </thead>
        <tbody>
          {products.map((entry) =>
            editingId === entry.id ? (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">
                  <Input aria-label="Editar nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Editar unidad de dosis"
                    value={editDoseUnit}
                    onChange={(e) => setEditDoseUnit(e.target.value)}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Editar días de retiro"
                    type="number"
                    value={editWithdrawalDays}
                    onChange={(e) => setEditWithdrawalDays(e.target.value)}
                  />
                </td>
                <td className="flex gap-1 py-1 pr-2">
                  <Button type="button" size="sm" disabled={!editName} onClick={() => saveEdit(entry.id)}>
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                    Cancelar
                  </Button>
                </td>
              </tr>
            ) : (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">{entry.name}</td>
                <td className="py-1 pr-2">{entry.defaultDoseUnit ?? "—"}</td>
                <td className="py-1 pr-2">{entry.defaultWithdrawalDays ?? "—"}</td>
                <td className="py-1 pr-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(entry)}>
                    Editar
                  </Button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      {editError ? <p className="text-sm text-destructive">{editError}</p> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="product-name">Nombre</Label>
        <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />

        <Label htmlFor="product-dose-unit">Unidad de dosis</Label>
        <Input id="product-dose-unit" value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} />

        <Label htmlFor="product-withdrawal-days">Días de retiro</Label>
        <Input
          id="product-withdrawal-days"
          type="number"
          value={withdrawalDays}
          onChange={(e) => setWithdrawalDays(e.target.value)}
        />

        {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

        <Button type="button" disabled={!name} onClick={handleCreate}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
```

Create `app/(protected)/settings/products/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductCatalogForm } from "@/components/settings/product-catalog-form";
import { listProducts } from "@/lib/dal/product-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function ProductsSettingsPage() {
  await requireSession();
  const products = await listProducts();

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Productos</CardTitle>
      </CardHeader>
      <CardContent>
        <ProductCatalogForm products={products} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- product-catalog-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/settings/products" components/settings/product-catalog-form.tsx __tests__/components/settings/product-catalog-form.test.tsx
git commit -m "feat: add products settings page with inline edit"
```

---

### Task 8: Paddocks settings page

**Files:**
- Create: `app/(protected)/settings/paddocks/actions.ts`
- Create: `app/(protected)/settings/paddocks/page.tsx`
- Create: `components/settings/paddock-catalog-form.tsx`
- Create: `__tests__/components/settings/paddock-catalog-form.test.tsx`

**Interfaces:**
- Consumes: `createPaddock`, `updatePaddock`, `listPaddocksForFarms`, `PaddockCatalogEntry` from `@/lib/dal/paddock-catalog` (Task 3); `listSelectableFarms`, `SelectableFarm` from `@/lib/dal/farm-access` (pre-existing); `isUniqueViolationError` from `@/lib/dal/unique-violation` (Task 4).
- Produces: `createPaddockAction`, `updatePaddockAction` returning `PaddockCatalogActionResult = { ok: true; entry: PaddockCatalogEntry } | { ok: false; error: string }`. `PaddockCatalogForm` client component with props `{ paddocks: PaddockCatalogEntry[]; farms: { id: string; name: string }[] }`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/settings/paddock-catalog-form.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaddockCatalogForm } from "@/components/settings/paddock-catalog-form";
import { createPaddockAction, updatePaddockAction } from "@/app/(protected)/settings/paddocks/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/paddocks/actions", () => ({
  createPaddockAction: vi.fn(),
  updatePaddockAction: vi.fn(),
}));

describe("PaddockCatalogForm", () => {
  it("lists paddocks with their farm, adds a new one, and edits an existing one", async () => {
    vi.mocked(createPaddockAction).mockResolvedValue({
      ok: true,
      entry: { id: "pad-2", name: "Potrero 2", farmId: "farm-1" },
    });
    vi.mocked(updatePaddockAction).mockResolvedValue({
      ok: true,
      entry: { id: "pad-1", name: "Potrero 1 (bajo)", farmId: "farm-1" },
    });

    render(
      <PaddockCatalogForm
        paddocks={[{ id: "pad-1", name: "Potrero 1", farmId: "farm-1" }]}
        farms={[{ id: "farm-1", name: "Campo Norte" }]}
      />
    );

    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("Campo Norte")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Campo"), "farm-1");
    await userEvent.type(screen.getByLabelText("Nombre"), "Potrero 2");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Potrero 2")).toBeInTheDocument());
    expect(createPaddockAction).toHaveBeenCalledWith({ farmId: "farm-1", name: "Potrero 2" });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editNameInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "Potrero 1 (bajo)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updatePaddockAction).toHaveBeenCalledWith({ id: "pad-1", name: "Potrero 1 (bajo)" }));
    expect(screen.getByText("Potrero 1 (bajo)")).toBeInTheDocument();
  });

  it("preselects the farm and disables the add button when the user has none", async () => {
    render(<PaddockCatalogForm paddocks={[]} farms={[]} />);

    expect(screen.getByText("No tenés campos asociados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  });

  it("shows an inline error when the name is a duplicate within the farm", async () => {
    vi.mocked(createPaddockAction).mockResolvedValue({
      ok: false,
      error: "Ya existe un potrero con ese nombre en ese campo",
    });

    render(<PaddockCatalogForm paddocks={[]} farms={[{ id: "farm-1", name: "Campo Norte" }]} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Potrero 1");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() =>
      expect(screen.getByText("Ya existe un potrero con ese nombre en ese campo")).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- paddock-catalog-form`
Expected: FAIL — component and actions module don't exist yet.

- [ ] **Step 3: Implement**

Create `app/(protected)/settings/paddocks/actions.ts`:

```ts
"use server";

import { requireSession } from "@/lib/dal/session";
import { createPaddock, updatePaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type PaddockCatalogActionResult = { ok: true; entry: PaddockCatalogEntry } | { ok: false; error: string };

export async function createPaddockAction(input: {
  farmId: string;
  name: string;
}): Promise<PaddockCatalogActionResult> {
  await requireSession();
  try {
    const entry = await createPaddock(input.farmId, input.name);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un potrero con ese nombre en ese campo" };
    throw error;
  }
}

export async function updatePaddockAction(input: {
  id: string;
  name: string;
}): Promise<PaddockCatalogActionResult> {
  await requireSession();
  try {
    const entry = await updatePaddock(input.id, input.name);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe un potrero con ese nombre en ese campo" };
    throw error;
  }
}
```

Create `components/settings/paddock-catalog-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPaddockAction, updatePaddockAction } from "@/app/(protected)/settings/paddocks/actions";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

type Farm = { id: string; name: string };

export function PaddockCatalogForm({
  paddocks: initialPaddocks,
  farms,
}: {
  paddocks: PaddockCatalogEntry[];
  farms: Farm[];
}) {
  const [paddocks, setPaddocks] = useState(initialPaddocks);
  const farmNameById = new Map(farms.map((f) => [f.id, f.name]));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(entry: PaddockCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editName) return;
    const result = await updatePaddockAction({ id, name: editName });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setPaddocks((prev) => prev.map((p) => (p.id === id ? result.entry : p)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!farmId || !name) return;
    const result = await createPaddockAction({ farmId, name });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setPaddocks((prev) => [...prev, result.entry]);
    setName("");
    setCreateError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Campo</th>
            <th className="py-1 pr-2" />
          </tr>
        </thead>
        <tbody>
          {paddocks.map((entry) =>
            editingId === entry.id ? (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">
                  <Input aria-label="Editar nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </td>
                <td className="py-1 pr-2">{farmNameById.get(entry.farmId) ?? ""}</td>
                <td className="flex gap-1 py-1 pr-2">
                  <Button type="button" size="sm" disabled={!editName} onClick={() => saveEdit(entry.id)}>
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                    Cancelar
                  </Button>
                </td>
              </tr>
            ) : (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">{entry.name}</td>
                <td className="py-1 pr-2">{farmNameById.get(entry.farmId) ?? ""}</td>
                <td className="py-1 pr-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(entry)}>
                    Editar
                  </Button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      {editError ? <p className="text-sm text-destructive">{editError}</p> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="paddock-farm">Campo</Label>
        <select
          id="paddock-farm"
          value={farmId}
          onChange={(e) => setFarmId(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name}
            </option>
          ))}
        </select>

        <Label htmlFor="paddock-name">Nombre</Label>
        <Input id="paddock-name" value={name} onChange={(e) => setName(e.target.value)} />

        {farms.length === 0 ? <p className="text-sm text-muted-foreground">No tenés campos asociados</p> : null}
        {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

        <Button type="button" disabled={!farmId || !name} onClick={handleCreate}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
```

Create `app/(protected)/settings/paddocks/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaddockCatalogForm } from "@/components/settings/paddock-catalog-form";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { listPaddocksForFarms } from "@/lib/dal/paddock-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function PaddocksSettingsPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);
  const paddocks = await listPaddocksForFarms(farms.map((f) => f.id));

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Potreros</CardTitle>
      </CardHeader>
      <CardContent>
        <PaddockCatalogForm paddocks={paddocks} farms={farms} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- paddock-catalog-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/settings/paddocks" components/settings/paddock-catalog-form.tsx __tests__/components/settings/paddock-catalog-form.test.tsx
git commit -m "feat: add paddocks settings page with inline edit"
```

---

### Task 9: Categories settings page

**Files:**
- Create: `app/(protected)/settings/categories/actions.ts`
- Create: `app/(protected)/settings/categories/page.tsx`
- Create: `components/settings/category-catalog-form.tsx`
- Create: `__tests__/components/settings/category-catalog-form.test.tsx`

**Interfaces:**
- Consumes: `listCategories`, `createCategory`, `updateCategory`, `CategoryCatalogEntry` from `@/lib/dal/category-catalog` (Task 2); `isUniqueViolationError` from `@/lib/dal/unique-violation` (Task 4).
- Produces: `createCategoryAction`, `updateCategoryAction` returning `CategoryCatalogActionResult = { ok: true; entry: CategoryCatalogEntry } | { ok: false; error: string }`. `CategoryCatalogForm` client component with props `{ categories: CategoryCatalogEntry[] }`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/settings/category-catalog-form.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import { createCategoryAction, updateCategoryAction } from "@/app/(protected)/settings/categories/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/categories/actions", () => ({
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
}));

describe("CategoryCatalogForm", () => {
  it("lists categories, adds a new one, and edits an existing one", async () => {
    vi.mocked(createCategoryAction).mockResolvedValue({
      ok: true,
      entry: { id: "cat-2", name: "Toro", sortOrder: 1 },
    });
    vi.mocked(updateCategoryAction).mockResolvedValue({
      ok: true,
      entry: { id: "cat-1", name: "Vaca de invernada", sortOrder: 0 },
    });

    render(<CategoryCatalogForm categories={[{ id: "cat-1", name: "Vaca", sortOrder: 0 }]} />);

    expect(screen.getByText("Vaca")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nombre"), "Toro");
    const sortOrderInput = screen.getByLabelText("Orden");
    await userEvent.clear(sortOrderInput);
    await userEvent.type(sortOrderInput, "1");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Toro")).toBeInTheDocument());
    expect(createCategoryAction).toHaveBeenCalledWith({ name: "Toro", sortOrder: 1 });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editNameInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "Vaca de invernada");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateCategoryAction).toHaveBeenCalledWith({ id: "cat-1", name: "Vaca de invernada", sortOrder: 0 })
    );
    expect(screen.getByText("Vaca de invernada")).toBeInTheDocument();
  });

  it("shows an inline error when the name is a duplicate", async () => {
    vi.mocked(createCategoryAction).mockResolvedValue({ ok: false, error: "Ya existe una categoría con ese nombre" });

    render(<CategoryCatalogForm categories={[]} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Vaca");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Ya existe una categoría con ese nombre")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- category-catalog-form`
Expected: FAIL — component and actions module don't exist yet.

- [ ] **Step 3: Implement**

Create `app/(protected)/settings/categories/actions.ts`:

```ts
"use server";

import { requireSession } from "@/lib/dal/session";
import { createCategory, updateCategory, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

export type CategoryCatalogActionResult = { ok: true; entry: CategoryCatalogEntry } | { ok: false; error: string };

export async function createCategoryAction(input: {
  name: string;
  sortOrder: number;
}): Promise<CategoryCatalogActionResult> {
  await requireSession();
  try {
    const entry = await createCategory(input.name, input.sortOrder);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe una categoría con ese nombre" };
    throw error;
  }
}

export async function updateCategoryAction(input: {
  id: string;
  name: string;
  sortOrder: number;
}): Promise<CategoryCatalogActionResult> {
  await requireSession();
  try {
    const entry = await updateCategory(input.id, input);
    return { ok: true, entry };
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, error: "Ya existe una categoría con ese nombre" };
    throw error;
  }
}
```

Create `components/settings/category-catalog-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategoryAction, updateCategoryAction } from "@/app/(protected)/settings/categories/actions";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";

export function CategoryCatalogForm({ categories: initialCategories }: { categories: CategoryCatalogEntry[] }) {
  const [categories, setCategories] = useState(initialCategories);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(String(initialCategories.length));
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(entry: CategoryCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditSortOrder(String(entry.sortOrder));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editName || editSortOrder === "") return;
    const result = await updateCategoryAction({ id, name: editName, sortOrder: Number(editSortOrder) });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? result.entry : c)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!name || sortOrder === "") return;
    const result = await createCategoryAction({ name, sortOrder: Number(sortOrder) });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setCategories((prev) => [...prev, result.entry]);
    setName("");
    setSortOrder(String(categories.length + 1));
    setCreateError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Orden</th>
            <th className="py-1 pr-2" />
          </tr>
        </thead>
        <tbody>
          {categories.map((entry) =>
            editingId === entry.id ? (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">
                  <Input aria-label="Editar nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Editar orden"
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(e.target.value)}
                  />
                </td>
                <td className="flex gap-1 py-1 pr-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!editName || editSortOrder === ""}
                    onClick={() => saveEdit(entry.id)}
                  >
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                    Cancelar
                  </Button>
                </td>
              </tr>
            ) : (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">{entry.name}</td>
                <td className="py-1 pr-2">{entry.sortOrder}</td>
                <td className="py-1 pr-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(entry)}>
                    Editar
                  </Button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      {editError ? <p className="text-sm text-destructive">{editError}</p> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="category-name">Nombre</Label>
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} />

        <Label htmlFor="category-sort-order">Orden</Label>
        <Input
          id="category-sort-order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />

        {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

        <Button type="button" disabled={!name || sortOrder === ""} onClick={handleCreate}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
```

Create `app/(protected)/settings/categories/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import { listCategories } from "@/lib/dal/category-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function CategoriesSettingsPage() {
  await requireSession();
  const categories = await listCategories();

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Categorías</CardTitle>
      </CardHeader>
      <CardContent>
        <CategoryCatalogForm categories={categories} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- category-catalog-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/settings/categories" components/settings/category-catalog-form.tsx __tests__/components/settings/category-catalog-form.test.tsx
git commit -m "feat: add categories settings page with inline edit"
```

---

### Task 10: E2E — hub navigation and catalog CRUD

**Files:**
- Create: `e2e/farm-settings-hub.spec.ts`

**Interfaces:**
- Consumes: the running app with Tasks 1–9 applied; the seeded admin user (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, same as `e2e/auth-flow.spec.ts`).

- [ ] **Step 1: Write the E2E test**

Create `e2e/farm-settings-hub.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("opens Configuración del campo from the header and manages a product end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("link", { name: "Configuración del campo" }).click();
  await page.waitForURL(/\/settings\/dicose/);

  await page.getByRole("link", { name: "Productos" }).click();
  await page.waitForURL(/\/settings\/products/);

  await page.getByLabel("Nombre").fill("Ivermectina E2E");
  await page.getByLabel("Unidad de dosis").fill("ml");
  await page.getByLabel("Días de retiro").fill("21");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Ivermectina E2E")).toBeVisible();

  await page.getByRole("button", { name: "Editar" }).first().click();
  await page.getByLabel("Editar unidad de dosis").fill("cc");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("cc")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Ivermectina E2E")).toBeVisible();
  await expect(page.getByText("cc")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E test**

Run: `npm run test:e2e -- e2e/farm-settings-hub.spec.ts`
Expected: PASS (requires the dev server and test database to be up, same prerequisites as the other `e2e/*.spec.ts` files).

- [ ] **Step 3: Commit**

```bash
git add e2e/farm-settings-hub.spec.ts
git commit -m "test: add e2e coverage for the farm settings hub"
```

---

## Self-Review Notes

- **Spec coverage:** navigation change (Task 5), sidebar layout (Task 6), product/paddock/category `update*` (Tasks 1–3), all three new pages (Tasks 7–9), duplicate-name handling (Task 4 + used throughout 7–9), permissions (paddocks scoped via `listSelectableFarms`, products/categories global — Tasks 7 & 9 vs Task 8), testing pyramid (unit DAL, component, e2e — Tasks 1–4 unit, 7–9 component, 10 e2e) are all covered.
- **Type consistency verified:** `ProductCatalogEntry`/`CategoryCatalogEntry`/`PaddockCatalogEntry` field names match between DAL (Tasks 1–3), action result types (Tasks 7–9), and form component props/state across all steps.
- **No placeholders:** every step has complete, runnable code — no "add error handling" or "similar to Task N" shortcuts.
