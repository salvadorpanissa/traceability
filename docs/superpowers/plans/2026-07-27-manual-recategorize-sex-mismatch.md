# Chequeo de sexo contra la categoría destino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When manually recategorizing animals to a sex-restricted target category, animals whose recorded sex doesn't match get a global-default + per-row decision (Omitir / Asignar igual) instead of being silently assigned.

**Architecture:** `resolveRecategorizeBatchRows` exposes each animal's `sex` on the `"existing"` and `"age-unresolvable"` row shapes (already fetched, just not returned today). The client derives, per row, whether a mismatch exists against the currently-selected target category's `sex` and renders a second global toggle + per-row `<select>`, mirroring the existing "sin edad calculable" pattern exactly. `confirmRecategorizeBatch` receives the resolved per-row decisions and re-derives both the animal's sex and the category's sex from the database before applying them — never trusting the client's row data, consistent with how it already re-derives farm/category for the existing security-hardened checks.

**Tech Stack:** Next.js Server Actions, Drizzle ORM, Postgres, Vitest (+ Testing Library).

## Global Constraints

- Mismatch exists only when: the target category's `sex` is set (`male` or `female`) AND the animal's `sex` is set AND they differ. An animal with no recorded sex, or a target category with no sex restriction, never triggers this — it's assigned normally, no question asked.
- In scope for this check: `"existing"` rows that are actually changing category, and `"age-unresolvable"` rows whose (already-existing) age decision is `"assignTarget"`. **Not** in scope: `"age-resolved"` rows — `resolveCategoryForAge` already picks a sex-eligible category, so a mismatch there is structurally impossible.
- Reuse the existing `UnresolvableDecision = "skip" | "assignTarget"` type for the new sex decision — don't introduce a parallel type.
- Never trust client-supplied `sex` for the actual write decision in `confirmRecategorizeBatch` — re-derive from `animal_current_state`/`animal` via the batched query that function already runs (`loadFreshState`), exactly like the existing farm/category re-derivation.
- All new UI copy is in Spanish, matching the existing "Sin edad calculable" / "Omitir" / "Asignar categoría destino" style (use "Asignar igual" for this control, per the design spec).

---

## File Structure

- Modify `web/lib/activities/recategorize-resolution.ts` — add `sex` to the `"existing"` and `"age-unresolvable"` row shapes.
- Modify `web/__tests__/lib/activities/recategorize-resolution.test.ts` — cover the new field.
- Modify `web/lib/activities/recategorize.ts` — add `sexMismatchDecisions` param and the mismatch-aware exclusion logic.
- Modify `web/__tests__/lib/activities/recategorize-confirm.test.ts` — cover the new exclusion/inclusion paths.
- Modify `web/app/(protected)/activities/recategorize/actions.ts` — thread `sexMismatchDecisions` through `confirmRecategorizeBatchAction`.
- Modify `web/__tests__/activities/recategorize-actions.test.ts` — update the existing `confirmRecategorizeBatchAction` call.
- Modify `web/components/activities/recategorize-form.tsx` — add the second global toggle, per-row override state, and the mismatch-scoping logic.
- Modify `web/components/activities/recategorize-preview-table.tsx` — render the new selector(s).
- Modify `web/__tests__/components/recategorize-form.test.tsx` — cover the new UI paths.

---

### Task 1: Expose animal sex on resolved rows

**Files:**
- Modify: `web/lib/activities/recategorize-resolution.ts`
- Test: `web/__tests__/lib/activities/recategorize-resolution.test.ts`

**Interfaces:**
- Produces: `RecategorizeResolvedRow`'s `"existing"` and `"age-unresolvable"` variants each gain `sex: "male" | "female" | null`. No other exported signature changes.

- [ ] **Step 1: Write the failing tests**

In `web/__tests__/lib/activities/recategorize-resolution.test.ts`:

1. Update the first test's `toEqual` (the one named `"resolves an alive animal with its current category, regardless of which farm it's on"`) to add `sex: null` to the expected object (the seeded animal has no `sex` set):

```ts
    expect(result).toEqual([
      {
        tag: "AR1",
        eventDate: "2026-03-01",
        notes: null,
        status: "existing",
        animalId: expect.any(String),
        currentFarmId: seededFarm.id,
        currentCategoryId: novillo.id,
        currentCategoryName: "Novillo",
        sex: null,
      },
    ]);
```

2. Add two new tests at the end of the `describe("resolveRecategorizeBatchRows", ...)` block:

```ts
  it("includes the animal's sex on an existing row", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: novillo.id,
      sex: "female",
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "existing", sex: "female" });
  });

  it("includes the animal's sex on an age-unresolvable row", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    await testDb.insert(category).values({ name: "Novillo", sex: "male", minAgeMonths: 24 });
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: null,
      sex: "female",
      birthDate: null,
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "age-unresolvable", sex: "female" });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run __tests__/lib/activities/recategorize-resolution.test.ts`
Expected: FAIL — the first test's `toEqual` rejects the missing `sex` field; the two new tests fail because `sex` isn't in the result at all yet.

- [ ] **Step 3: Add `sex` to both row shapes**

In `web/lib/activities/recategorize-resolution.ts`, update the `RecategorizeResolvedRow` type — add `sex: "male" | "female" | null;` to the `"existing"` variant (after `currentCategoryName`) and to the `"age-unresolvable"` variant (after `currentFarmId`):

```ts
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      status: "existing";
      animalId: string;
      currentFarmId: string;
      currentCategoryId: string;
      currentCategoryName: string | null;
      sex: "male" | "female" | null;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      status: "age-resolved";
      animalId: string;
      currentFarmId: string;
      resolvedCategoryId: string;
      resolvedCategoryName: string;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      status: "age-unresolvable";
      animalId: string;
      currentFarmId: string;
      sex: "male" | "female" | null;
    }
  | { tag: string; eventDate: string; notes: string | null; status: "error"; reason: string };
```

Then update the two `result.push(...)` calls. The `"age-unresolvable"` push (inside the `if (!state.current_category_id) { ... }` block):

```ts
      result.push({
        tag: row.tag,
        eventDate,
        notes,
        status: "age-unresolvable",
        animalId,
        currentFarmId: state.current_farm_id,
        sex: state.sex,
      });
      continue;
```

The `"existing"` push (at the end of the function):

```ts
    result.push({
      tag: row.tag,
      eventDate,
      notes,
      status: "existing",
      animalId,
      currentFarmId: state.current_farm_id,
      currentCategoryId: state.current_category_id,
      currentCategoryName: state.category_name,
      sex: state.sex,
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run __tests__/lib/activities/recategorize-resolution.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add web/lib/activities/recategorize-resolution.ts web/__tests__/lib/activities/recategorize-resolution.test.ts
git commit -m "feat: expose animal sex on existing/age-unresolvable recategorize rows"
```

---

### Task 2: Confirm — sex-mismatch decisions, re-derived from the DB

**Files:**
- Modify: `web/lib/activities/recategorize.ts`
- Test: `web/__tests__/lib/activities/recategorize-confirm.test.ts`

**Interfaces:**
- Consumes: `RecategorizeResolvedRow` with `sex` (Task 1).
- Produces: `confirmRecategorizeBatch(input: { userId; role; targetCategoryId; rows; unresolvableDecisions; sexMismatchDecisions: Record<string, UnresolvableDecision> }): Promise<void>` — one new required field, keyed by `animalId`.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe("confirmRecategorizeBatch", ...)` block in `web/__tests__/lib/activities/recategorize-confirm.test.ts`, right before its closing `});`. They call `confirmRecategorizeBatch` with the new field already present — until Task 2's implementation lands, these fail (in some cases with a straightforward TypeScript error on the missing param, in others because the mismatch never gets excluded):

```ts
  it("excludes an existing row when the animal's sex doesn't match the target category's sex and the decision is skip (default)", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novilloMacho.id,
        rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  it("writes the event for an existing row with mismatched sex when the decision is assignTarget", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloMacho.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: { [animalId]: "assignTarget" },
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: vaca.id, newCategoryId: novilloMacho.id, source: "manual" });
  });

  it("never asks about sex when the animal has no sex recorded", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, categoryId: vaca.id });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloMacho.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    expect(await newEventsFor(animalId)).toHaveLength(1);
  });

  it("never asks about sex when the target category has no sex restriction", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [vaca] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedAnimalAtFarm({
      farmId: seededFarm.id,
      createdBy: admin.id,
      categoryId: vaca.id,
      sex: "female",
    });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novillo.id,
      rows: [existingRow(seededFarm.id, { animalId, currentCategoryId: vaca.id })],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    expect(await newEventsFor(animalId)).toHaveLength(1);
  });

  it("excludes an age-unresolvable row assigned to the target when its sex doesn't match and the sex decision is skip", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, sex: "female" });
    await refreshDerivedState();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        targetCategoryId: novilloMacho.id,
        rows: [unresolvableRow(seededFarm.id, { animalId })],
        unresolvableDecisions: { [animalId]: "assignTarget" },
        sexMismatchDecisions: {},
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    expect(await newEventsFor(animalId)).toHaveLength(0);
  });

  it("writes the event for an age-unresolvable row assigned to the target despite mismatched sex when the sex decision is assignTarget", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novilloMacho] = await testDb.insert(category).values({ name: "Novillo", sex: "male" }).returning();
    const animalId = await seedAnimalAtFarm({ farmId: seededFarm.id, createdBy: admin.id, sex: "female" });
    await refreshDerivedState();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      targetCategoryId: novilloMacho.id,
      rows: [unresolvableRow(seededFarm.id, { animalId })],
      unresolvableDecisions: { [animalId]: "assignTarget" },
      sexMismatchDecisions: { [animalId]: "assignTarget" },
    });

    const events = await newEventsFor(animalId);
    expect(events).toHaveLength(1);
    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat).toMatchObject({ oldCategoryId: novilloMacho.id, newCategoryId: novilloMacho.id, source: "initial" });
  });
```

Also update every **other** existing call to `confirmRecategorizeBatch` already in this file (all 12 of them, written before this task) to add `sexMismatchDecisions: {}` alongside their existing `unresolvableDecisions: {}` — the function's input type is about to make that field required, so every call site in this file needs it or the whole file fails to type-check. Add `sexMismatchDecisions: {},` right after each `unresolvableDecisions: ...,` line (a project-wide search for `unresolvableDecisions:` in this file finds all of them).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run __tests__/lib/activities/recategorize-confirm.test.ts`
Expected: FAIL — TypeScript rejects the missing `sexMismatchDecisions` field on `confirmRecategorizeBatch`'s type; once stubbed in mentally, the six new tests fail because the exclusion logic doesn't exist yet.

- [ ] **Step 3: Implement the sex-mismatch logic**

In `web/lib/activities/recategorize.ts`:

Change the import line to add `eq`:

```ts
import { eq, isNotNull, sql } from "drizzle-orm";
```

Change the function signature and destructuring:

```ts
export async function confirmRecategorizeBatch(input: {
  userId: string;
  role: string | undefined;
  targetCategoryId: string;
  rows: RecategorizeResolvedRow[];
  unresolvableDecisions: Record<string, UnresolvableDecision>;
  sexMismatchDecisions: Record<string, UnresolvableDecision>;
}): Promise<void> {
  const { userId, role, targetCategoryId, rows, unresolvableDecisions, sexMismatchDecisions } = input;
```

Right after the existing `ageManagedCategories` block (before the `const plannedChanges: PlannedChange[] = [];` line), fetch the target category's sex once:

```ts
  const [targetCategoryRow] = await db.select({ sex: category.sex }).from(category).where(eq(category.id, targetCategoryId));
  const targetCategorySex = targetCategoryRow?.sex ?? null;

  function isSexMismatch(animalSex: "male" | "female" | null): boolean {
    return targetCategorySex !== null && animalSex !== null && animalSex !== targetCategorySex;
  }
```

In the `"existing"` branch, insert the mismatch check between the no-op check and the `plannedChanges.push`:

```ts
    if (row.status === "existing") {
      if (state.current_category_id === null || state.current_category_id !== row.currentCategoryId) {
        throw new Error(STALE_BATCH_ERROR);
      }
      if (state.current_category_id === targetCategoryId) continue;
      if (isSexMismatch(state.sex)) {
        const sexDecision = sexMismatchDecisions[row.animalId] ?? "skip";
        if (sexDecision === "skip") continue;
      }
      plannedChanges.push({
        animalId: row.animalId,
        farmId,
        eventDate: row.eventDate,
        notes: row.notes,
        oldCategoryId: state.current_category_id,
        newCategoryId: targetCategoryId,
        source: "manual",
      });
      continue;
    }
```

In the `age-unresolvable` branch (the last block before `if (plannedChanges.length === 0)`), insert the same check after the existing age-decision `skip` check:

```ts
    // age-unresolvable
    if (resolvedCategoryId) throw new Error(STALE_BATCH_ERROR);
    const decision = unresolvableDecisions[row.animalId] ?? "skip";
    if (decision === "skip") continue;
    if (isSexMismatch(state.sex)) {
      const sexDecision = sexMismatchDecisions[row.animalId] ?? "skip";
      if (sexDecision === "skip") continue;
    }
    plannedChanges.push({
      animalId: row.animalId,
      farmId,
      eventDate: row.eventDate,
      notes: row.notes,
      oldCategoryId: targetCategoryId,
      newCategoryId: targetCategoryId,
      source: "initial",
    });
```

Everything else in the file (the per-farm transaction loop, the refresh, the error messages) is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run __tests__/lib/activities/recategorize-confirm.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add web/lib/activities/recategorize.ts web/__tests__/lib/activities/recategorize-confirm.test.ts
git commit -m "feat: exclude sex-mismatched animals from a recategorize batch unless explicitly assigned"
```

---

### Task 3: Thread `sexMismatchDecisions` through the server action

**Files:**
- Modify: `web/app/(protected)/activities/recategorize/actions.ts`
- Test: `web/__tests__/activities/recategorize-actions.test.ts`

**Interfaces:**
- Consumes: `confirmRecategorizeBatch` with `sexMismatchDecisions` (Task 2).
- Produces: `confirmRecategorizeBatchAction(input: { headerSignature; mapping; targetCategoryId; rows; unresolvableDecisions; sexMismatchDecisions: Record<string, UnresolvableDecision> }): Promise<void>` — one new required field.

- [ ] **Step 1: Write the failing test edit**

In `web/__tests__/activities/recategorize-actions.test.ts`, in the `confirmRecategorizeBatchAction` test, add `sexMismatchDecisions: {},` right after the existing `unresolvableDecisions: {},` line:

```ts
    await confirmRecategorizeBatchAction({
      headerSignature: JSON.stringify(["Caravana", "Fecha"]),
      mapping: [
        { header: "Caravana", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ],
      targetCategoryId: novilloPlus3.id,
      rows: [
        {
          tag: "AR1",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: createdAnimal.id,
          currentFarmId: seededFarm.id,
          currentCategoryId: novillo.id,
          currentCategoryName: "Novillo",
        },
      ],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run __tests__/activities/recategorize-actions.test.ts`
Expected: FAIL — TypeScript rejects the still-required-but-missing `sexMismatchDecisions` on `confirmRecategorizeBatchAction`'s current (pre-Task-3) type.

- [ ] **Step 3: Update the action**

In `web/app/(protected)/activities/recategorize/actions.ts`, update `confirmRecategorizeBatchAction`:

```ts
export async function confirmRecategorizeBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  targetCategoryId: string;
  rows: RecategorizeResolvedRow[];
  unresolvableDecisions: Record<string, UnresolvableDecision>;
  sexMismatchDecisions: Record<string, UnresolvableDecision>;
}): Promise<void> {
  const session = await requireSession();

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoUpdate({ target: columnMapping.headerSignature, set: { mapping: input.mapping } });

  await confirmRecategorizeBatch({
    userId: session.user.id,
    role: session.user.role,
    targetCategoryId: input.targetCategoryId,
    rows: input.rows,
    unresolvableDecisions: input.unresolvableDecisions,
    sexMismatchDecisions: input.sexMismatchDecisions,
  });
}
```

No other function in this file changes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run __tests__/activities/recategorize-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/\(protected\)/activities/recategorize/actions.ts web/__tests__/activities/recategorize-actions.test.ts
git commit -m "feat: thread sexMismatchDecisions through confirmRecategorizeBatchAction"
```

---

### Task 4: Frontend — second toggle, per-row override, composite row rendering

**Files:**
- Modify: `web/components/activities/recategorize-form.tsx`
- Modify: `web/components/activities/recategorize-preview-table.tsx`
- Test: `web/__tests__/components/recategorize-form.test.tsx`

**Interfaces:**
- Consumes: `RecategorizeResolvedRow` with `sex` (Task 1), `confirmRecategorizeBatchAction` with `sexMismatchDecisions` (Task 3).
- Produces: `RecategorizePreviewTable` gains three new required props: `sexMismatchAnimalIds: Set<string>`, `sexMismatchDecisions: Record<string, UnresolvableDecision>`, `onSexMismatchDecisionChange: (animalId: string, decision: UnresolvableDecision) => void`. `RecategorizeForm`'s public props are unchanged (`{ categories }`).

- [ ] **Step 1: Write the failing tests**

Add these two tests at the end of the `describe("RecategorizeForm", ...)` block in `web/__tests__/components/recategorize-form.test.tsx`:

```ts
  it("excludes a sex-mismatched existing row by default, and includes it when overridden to assignTarget", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [
        {
          tag: "AR5",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: "animal-5",
          currentFarmId: "farm-1",
          currentCategoryId: "cat-vaca",
          currentCategoryName: "Vaca",
          sex: "female",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(
      <RecategorizeForm
        categories={[
          { id: "cat-vaca", name: "Vaca", sex: null, minAgeMonths: null },
          { id: "cat-novillo-macho", name: "Novillo", sex: "male", minAgeMonths: null },
        ]}
      />
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo-macho");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR5")).toBeInTheDocument());
    // Default global decision is "Omitir" — Confirmar stays disabled since there's nothing to change.
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Decisión de sexo para AR5"), "assignTarget");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ sexMismatchDecisions: { "animal-5": "assignTarget" } })
      )
    );
  });

  it("shows a second decision selector on an age-unresolvable row once assigned to a mismatched target", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [
        {
          tag: "AR6",
          eventDate: "2026-03-01",
          notes: null,
          status: "age-unresolvable",
          animalId: "animal-6",
          currentFarmId: "farm-1",
          sex: "female",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(
      <RecategorizeForm categories={[{ id: "cat-novillo-macho", name: "Novillo", sex: "male", minAgeMonths: null }]} />
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo-macho");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR6")).toBeInTheDocument());
    // The sex-mismatch selector only appears once the age decision is "assignTarget".
    expect(screen.queryByLabelText("Decisión de sexo para AR6")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Decisión para AR6"), "assignTarget");
    expect(screen.getByLabelText("Decisión de sexo para AR6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Decisión de sexo para AR6"), "assignTarget");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({
          unresolvableDecisions: { "animal-6": "assignTarget" },
          sexMismatchDecisions: { "animal-6": "assignTarget" },
        })
      )
    );
  });
```

Also add `sexMismatchDecisions: {}` to the `expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith({...})` object-literal assertions in the file's first two tests (`"uploads a file without asking for a farm..."` and the age-resolved test uses `expect.objectContaining`, which doesn't need editing — only the literal-object assertion in the first test needs the new field added):

```ts
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith({
        headerSignature: "sig",
        mapping: [],
        targetCategoryId: "cat-novillo-plus3",
        rows: expect.any(Array),
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    );
```

And the existing `"lets the user override the global decision for an individual age-unresolvable row"` test's final assertion, which also uses `expect.objectContaining` and needs no change.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run __tests__/components/recategorize-form.test.tsx`
Expected: FAIL — no sex-mismatch UI exists yet, `sexMismatchDecisions` is never passed, `getByLabelText("Decisión de sexo para ...")` finds nothing.

- [ ] **Step 3: Implement the table changes**

Replace the full contents of `web/components/activities/recategorize-preview-table.tsx` with:

```tsx
import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";

function SexMismatchSelect({
  tag,
  decision,
  onChange,
}: {
  tag: string;
  decision: UnresolvableDecision;
  onChange: (decision: UnresolvableDecision) => void;
}) {
  return (
    <span>
      <span className="text-muted-foreground">Sexo no coincide</span>{" "}
      <select
        aria-label={`Decisión de sexo para ${tag}`}
        value={decision}
        onChange={(e) => onChange(e.target.value as UnresolvableDecision)}
        className="h-7 rounded-lg border border-border bg-background px-1 text-xs"
      >
        <option value="skip">Omitir</option>
        <option value="assignTarget">Asignar igual</option>
      </select>
    </span>
  );
}

export function RecategorizePreviewTable({
  rows,
  targetCategoryName,
  unresolvableDecisions,
  onDecisionChange,
  sexMismatchAnimalIds,
  sexMismatchDecisions,
  onSexMismatchDecisionChange,
}: {
  rows: RecategorizeResolvedRow[];
  targetCategoryName: string;
  unresolvableDecisions: Record<string, UnresolvableDecision>;
  onDecisionChange: (animalId: string, decision: UnresolvableDecision) => void;
  sexMismatchAnimalIds: Set<string>;
  sexMismatchDecisions: Record<string, UnresolvableDecision>;
  onSexMismatchDecisionChange: (animalId: string, decision: UnresolvableDecision) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">Caravana</th>
          <th className="py-1 pr-2">Categoría actual</th>
          <th className="py-1 pr-2">Categoría nueva</th>
          <th className="py-1 pr-2">Estado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          if (row.status === "existing") {
            const hasSexMismatch = sexMismatchAnimalIds.has(row.animalId);
            const sexDecision = sexMismatchDecisions[row.animalId] ?? "skip";
            const assigning = !hasSexMismatch || sexDecision === "assignTarget";
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">{row.currentCategoryName ?? "—"}</td>
                <td className="py-1 pr-2">{assigning ? targetCategoryName : "—"}</td>
                <td className="py-1 pr-2">
                  {hasSexMismatch ? (
                    <SexMismatchSelect
                      tag={row.tag}
                      decision={sexDecision}
                      onChange={(decision) => onSexMismatchDecisionChange(row.animalId, decision)}
                    />
                  ) : (
                    "OK"
                  )}
                </td>
              </tr>
            );
          }
          if (row.status === "age-resolved") {
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">Sin categoría</td>
                <td className="py-1 pr-2">{row.resolvedCategoryName}</td>
                <td className="py-1 pr-2">OK (por edad)</td>
              </tr>
            );
          }
          if (row.status === "age-unresolvable") {
            const decision = unresolvableDecisions[row.animalId] ?? "skip";
            const hasSexMismatch = sexMismatchAnimalIds.has(row.animalId);
            const sexDecision = sexMismatchDecisions[row.animalId] ?? "skip";
            const assigning = decision === "assignTarget" && (!hasSexMismatch || sexDecision === "assignTarget");
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">Sin categoría</td>
                <td className="py-1 pr-2">{assigning ? targetCategoryName : "—"}</td>
                <td className="py-1 pr-2">
                  <div className="flex flex-col gap-1">
                    <span>
                      <span className="text-muted-foreground">Sin edad calculable</span>{" "}
                      <select
                        aria-label={`Decisión para ${row.tag}`}
                        value={decision}
                        onChange={(e) => onDecisionChange(row.animalId, e.target.value as UnresolvableDecision)}
                        className="h-7 rounded-lg border border-border bg-background px-1 text-xs"
                      >
                        <option value="skip">Omitir</option>
                        <option value="assignTarget">Asignar categoría destino</option>
                      </select>
                    </span>
                    {hasSexMismatch ? (
                      <SexMismatchSelect
                        tag={row.tag}
                        decision={sexDecision}
                        onChange={(d) => onSexMismatchDecisionChange(row.animalId, d)}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          }
          return (
            <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
              <td className="py-1 pr-2">{row.tag || "—"}</td>
              <td className="py-1 pr-2">—</td>
              <td className="py-1 pr-2">—</td>
              <td className="py-1 pr-2">
                <span className="text-destructive">{row.reason}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Implement the form changes**

In `web/components/activities/recategorize-form.tsx`:

Add two new pieces of state, right after the existing `unresolvableOverrides` state:

```ts
  const [globalSexMismatchDefault, setGlobalSexMismatchDefault] = useState<UnresolvableDecision>("skip");
  const [sexMismatchOverrides, setSexMismatchOverrides] = useState<Record<string, UnresolvableDecision>>({});
```

In `handleFileChange`, reset the new override map alongside the existing one:

```ts
  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setUnresolvableOverrides({});
    setSexMismatchOverrides({});
  }
```

Right after the existing `unresolvableDecisions` `useMemo`, add the mismatch-scoping and decision-resolution logic:

```ts
  const targetCategorySex = categories.find((c) => c.id === targetCategoryId)?.sex ?? null;

  // A row only needs a sex decision when it's actually headed for
  // targetCategoryId (an "existing" row changing category, or an
  // "age-unresolvable" row whose age decision is "assignTarget") AND both
  // sexes are known and differ — resolveCategoryForAge already guarantees
  // "age-resolved" rows can never mismatch, so they're never in scope here.
  const sexMismatchAnimalIds = useMemo(() => {
    const ids = new Set<string>();
    if (!targetCategorySex) return ids;
    for (const row of rows) {
      if (
        row.status === "existing" &&
        row.currentCategoryId !== targetCategoryId &&
        row.sex &&
        row.sex !== targetCategorySex
      ) {
        ids.add(row.animalId);
      }
      if (
        row.status === "age-unresolvable" &&
        unresolvableDecisions[row.animalId] === "assignTarget" &&
        row.sex &&
        row.sex !== targetCategorySex
      ) {
        ids.add(row.animalId);
      }
    }
    return ids;
  }, [rows, targetCategoryId, targetCategorySex, unresolvableDecisions]);

  const sexMismatchDecisions = useMemo(() => {
    const decisions: Record<string, UnresolvableDecision> = {};
    for (const animalId of sexMismatchAnimalIds) {
      decisions[animalId] = sexMismatchOverrides[animalId] ?? globalSexMismatchDefault;
    }
    return decisions;
  }, [sexMismatchAnimalIds, sexMismatchOverrides, globalSexMismatchDefault]);
```

Add the change handler right after `handleDecisionChange`:

```ts
  function handleSexMismatchDecisionChange(animalId: string, decision: UnresolvableDecision) {
    setSexMismatchOverrides((prev) => ({ ...prev, [animalId]: decision }));
  }
```

Update `handleConfirm` to send the new field:

```ts
      await confirmRecategorizeBatchAction({
        headerSignature: preview.headerSignature,
        mapping: preview.mapping,
        targetCategoryId,
        rows,
        unresolvableDecisions,
        sexMismatchDecisions,
      });
```

Update `hasConfirmableRow` to account for the sex-mismatch exclusion on both statuses it applies to:

```ts
  const hasSexMismatchRows = sexMismatchAnimalIds.size > 0;
  const hasConfirmableRow = rows.some((r) => {
    if (r.status === "age-resolved") return true;
    if (r.status === "existing") {
      if (r.currentCategoryId === targetCategoryId) return false;
      if (sexMismatchAnimalIds.has(r.animalId)) return sexMismatchDecisions[r.animalId] === "assignTarget";
      return true;
    }
    if (r.status === "age-unresolvable") {
      if (unresolvableDecisions[r.animalId] !== "assignTarget") return false;
      if (sexMismatchAnimalIds.has(r.animalId)) return sexMismatchDecisions[r.animalId] === "assignTarget";
      return true;
    }
    return false;
  });
```

(This replaces the previous, simpler `hasConfirmableRow` definition — same variable name, same position in the file.)

Finally, add the second toggle block right after the existing "sin edad calculable" toggle block, and pass the three new props to `RecategorizePreviewTable`:

```tsx
          {hasSexMismatchRows ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>Animales de sexo distinto al de la categoría destino:</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={globalSexMismatchDefault === "skip" ? "default" : "outline"}
                  onClick={() => setGlobalSexMismatchDefault("skip")}
                >
                  Omitir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={globalSexMismatchDefault === "assignTarget" ? "default" : "outline"}
                  onClick={() => setGlobalSexMismatchDefault("assignTarget")}
                >
                  Asignar igual
                </Button>
              </div>
            </div>
          ) : null}
          <RecategorizePreviewTable
            rows={rows}
            targetCategoryName={targetCategoryName}
            unresolvableDecisions={unresolvableDecisions}
            onDecisionChange={handleDecisionChange}
            sexMismatchAnimalIds={sexMismatchAnimalIds}
            sexMismatchDecisions={sexMismatchDecisions}
            onSexMismatchDecisionChange={handleSexMismatchDecisionChange}
          />
```

(The `RecategorizePreviewTable` call replaces the existing one in place — same position, same surrounding `Button`/`confirmError` JSX untouched.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run __tests__/components/recategorize-form.test.tsx`
Expected: PASS (all tests, old and new)

- [ ] **Step 6: Run the full regression check for this activity**

Run: `cd web && npx vitest run __tests__/lib/activities/recategorize-resolution.test.ts __tests__/lib/activities/recategorize-confirm.test.ts __tests__/activities/recategorize-actions.test.ts __tests__/components/recategorize-form.test.tsx`
Expected: PASS (all four files)

- [ ] **Step 7: Commit**

```bash
git add web/components/activities/recategorize-form.tsx web/components/activities/recategorize-preview-table.tsx web/__tests__/components/recategorize-form.test.tsx
git commit -m "feat: add sex-mismatch decision UI to the recategorize form and preview table"
```

---

## Final Verification

- [ ] Run the full web test suite once more to catch any cross-file regressions: `cd web && npx vitest run`
- [ ] `grep -rn "sexMismatchDecisions" web/lib/activities/recategorize.ts web/app/\(protected\)/activities/recategorize/actions.ts web/components/activities/recategorize-form.tsx web/components/activities/recategorize-preview-table.tsx` to confirm the parameter is threaded consistently end to end with no leftover call site missing it.
