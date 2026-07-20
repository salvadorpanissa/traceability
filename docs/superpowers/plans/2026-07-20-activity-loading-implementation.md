# Activity Loading (Excel-Based) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Excel-based batch activity loading flow (traslado + sanidad, with automatic new-animal registration) described in [`docs/superpowers/specs/2026-07-20-activity-loading-design.md`](../specs/2026-07-20-activity-loading-design.md).

**Architecture:** Excel parsing is a pure client-agnostic function. A "validate" Server Action reads the file and cross-checks each caravana against the database, returning a preview held in React state — nothing is written yet. A "confirm" Server Action calls a Postgres RPC function (`security invoker`, so existing RLS applies exactly as it does everywhere else) that does all the writes — `batch_operation` + events + any new `animal`/`animal_tag_history` rows — inside one real database transaction.

**Tech Stack:** Same Next.js/Supabase app as the existing frontend (`web/`), plus `exceljs` for server-side Excel parsing (chosen over the `xlsx`/SheetJS npm package, which has unfixed high-severity ReDoS/prototype-pollution advisories on the free package — a real concern here since this code parses untrusted user-uploaded files). Backend logic lives in the existing `supabase/` migrations, tested with pgTAP.

## Global Constraints

- No service-role key anywhere — the RPC functions are `security invoker`, so every write still runs under the calling user's session and existing RLS policies.
- All UI copy in Spanish.
- The uploaded Excel is never persisted (not to disk, not to a database table) — it's parsed in-memory within the validate request and discarded; the client holds only the resulting structured preview.
- If any row in the parsed Excel has a validation error (duplicate tag, sold/dead animal, unknown category name), confirmation is blocked for the whole batch — no partial application.
- A newly-created animal's initial tag/farm/category are established via *self-referencing* events (`old_tag = new_tag`, `origin_farm_id = destination_farm_id` when no real prior placement exists, `old_category_id = new_category_id`) — the same convention already used in the merged schema for "no real prior state" placements. This is not new precedent, it's the existing one applied consistently.
- A destination paddock, when provided, must belong to the destination farm — validated in the RPC function (explicitly deferred to this plan by the paddocks schema spec: "se valida en la función/lógica de inserción de la batch operation").

---

## Task 1: Excel parsing

**Files:**
- Create: `web/lib/activities/types.ts`
- Create: `web/lib/activities/parse-tag-excel.ts`
- Create: `web/__tests__/parse-tag-excel.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `type ParsedExcelRow = { tag: string; category?: string }`
  - `type ExcelParseResult = { ok: true; rows: ParsedExcelRow[] } | { ok: false; error: string }`
  - `parseTagExcel(buffer: ArrayBuffer): Promise<ExcelParseResult>`

- [ ] **Step 1: Install exceljs**

```bash
cd web
npm install exceljs
```

Expected: `exceljs` added to `package.json` dependencies. No separate `@types/exceljs` needed — the package ships its own `./index.d.ts`.

- [ ] **Step 2: Write the failing test (RED)**

Create `web/lib/activities/types.ts`:

```ts
export type ParsedExcelRow = {
  tag: string
  category?: string
}

export type ExcelParseResult = { ok: true; rows: ParsedExcelRow[] } | { ok: false; error: string }
```

Create `web/__tests__/parse-tag-excel.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseTagExcel } from '@/lib/activities/parse-tag-excel'

async function buildExcelBuffer(headers: string[], rows: (string | undefined)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Caravanas')
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

describe('parseTagExcel', () => {
  test('parses tag-only rows', async () => {
    const buffer = await buildExcelBuffer(['caravana'], [['123'], ['456']])
    const result = await parseTagExcel(buffer)
    expect(result).toEqual({
      ok: true,
      rows: [
        { tag: '123', category: undefined },
        { tag: '456', category: undefined },
      ],
    })
  })

  test('parses tag + categoria columns', async () => {
    const buffer = await buildExcelBuffer(['caravana', 'categoria'], [['123', 'Ternero'], ['456', undefined]])
    const result = await parseTagExcel(buffer)
    expect(result).toEqual({
      ok: true,
      rows: [
        { tag: '123', category: 'Ternero' },
        { tag: '456', category: undefined },
      ],
    })
  })

  test('skips empty rows', async () => {
    const buffer = await buildExcelBuffer(['caravana'], [['123'], [undefined], ['456']])
    const result = await parseTagExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toHaveLength(2)
  })

  test('returns an error when the caravana column is missing', async () => {
    const buffer = await buildExcelBuffer(['otra_columna'], [['123']])
    const result = await parseTagExcel(buffer)
    expect(result).toEqual({ ok: false, error: 'El Excel no tiene una columna "caravana".' })
  })

  test('column matching is case-insensitive', async () => {
    const buffer = await buildExcelBuffer(['CARAVANA'], [['123']])
    const result = await parseTagExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toEqual([{ tag: '123', category: undefined }])
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run test
```

Expected: FAIL — `Cannot find module '@/lib/activities/parse-tag-excel'`.

- [ ] **Step 3: Implement (GREEN)**

Create `web/lib/activities/parse-tag-excel.ts`:

```ts
import ExcelJS from 'exceljs'
import type { ExcelParseResult, ParsedExcelRow } from './types'

export async function parseTagExcel(buffer: ArrayBuffer): Promise<ExcelParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    return { ok: false, error: 'El archivo no tiene ninguna hoja.' }
  }

  const headerRow = worksheet.getRow(1)
  let tagColumn = -1
  let categoryColumn = -1
  headerRow.eachCell((cell, colNumber) => {
    const value = String(cell.value ?? '').trim().toLowerCase()
    if (value === 'caravana') tagColumn = colNumber
    if (value === 'categoria' || value === 'categoría') categoryColumn = colNumber
  })

  if (tagColumn === -1) {
    return { ok: false, error: 'El Excel no tiene una columna "caravana".' }
  }

  const rows: ParsedExcelRow[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const tag = String(row.getCell(tagColumn).value ?? '').trim()
    if (!tag) return
    const category =
      categoryColumn !== -1 ? String(row.getCell(categoryColumn).value ?? '').trim() || undefined : undefined
    rows.push({ tag, category })
  })

  return { ok: true, rows }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test
```

Expected: PASS — all 5 tests in `parse-tag-excel.test.ts` green.

- [ ] **Step 5: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web
git commit -m "feat: add pure Excel parsing for caravana batch uploads"
```

---

## Task 2: `confirm_transfer_batch` database function

**Files:**
- Create: `supabase/migrations/<timestamp>_create_confirm_transfer_batch.sql`
- Create: `supabase/tests/11_confirm_transfer_batch.sql`

**Interfaces:**
- Produces: `public.confirm_transfer_batch(p_farm_id uuid, p_destination_farm_id uuid, p_destination_paddock_id uuid, p_event_date date, p_existing_animal_ids uuid[], p_new_animals jsonb) returns uuid` — `p_new_animals` is a JSON array of `{"tag": string, "category_id": string | null}`. Returns the created `batch_operation.id`.
- Consumes: `public.animal`, `public.animal_tag_history`, `public.batch_operation`, `public.event`, `public.event_transfer`, `public.event_retag`, `public.event_recategorize`, `public.paddock`, `public.animal_current_state` (all existing), `tests.create_supabase_user`/`tests.get_supabase_user`/`tests.authenticate_as`/`tests.clear_authentication` (existing test helpers).

- [ ] **Step 1: Write the failing test (RED)**

Create `supabase/tests/11_confirm_transfer_batch.sql`:

```sql
begin;
select plan(8);

select has_function('public', 'confirm_transfer_batch', 'confirm_transfer_batch function exists');

-- Fixture: two farms, two paddocks in the first, one existing animal already
-- placed in paddock 1, a manager scoped to both farms (admin needed for the
-- cross-farm case tested at the end).
insert into public.farm (id, name) values
  ('d1111111-1111-1111-1111-111111111111', 'Campo Norte'),
  ('d2222222-2222-2222-2222-222222222222', 'Campo Sur');
insert into public.paddock (id, farm_id, name) values
  ('d3333333-3333-3333-3333-333333333333', 'd1111111-1111-1111-1111-111111111111', 'Potrero 1'),
  ('d4444444-4444-4444-4444-444444444444', 'd1111111-1111-1111-1111-111111111111', 'Potrero 2');
insert into public.category (id, name) values ('d5555555-5555-5555-5555-555555555555', 'Ternero');

select tests.create_supabase_user('confirm_transfer_manager', 'confirm_transfer_manager@test.local', 'manager');
select tests.create_supabase_user('confirm_transfer_admin', 'confirm_transfer_admin@test.local', 'admin');
insert into public.user_farm (user_id, farm_id) values
  (tests.get_supabase_user('confirm_transfer_manager'), 'd1111111-1111-1111-1111-111111111111');

-- An existing animal, placed in Potrero 1 via a normal transfer event.
insert into public.animal (id) values ('d6666666-6666-6666-6666-666666666666');
insert into public.batch_operation (id, event_type, farm_id, animal_count, created_by)
values ('d7777777-7777-7777-7777-777777777777', 'transfer', 'd1111111-1111-1111-1111-111111111111', 1,
        tests.get_supabase_user('confirm_transfer_manager'));
insert into public.event (id, event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
values ('d8888888-8888-8888-8888-888888888888', 'transfer', '2026-01-01', 'd6666666-6666-6666-6666-666666666666',
        'd1111111-1111-1111-1111-111111111111', 'd7777777-7777-7777-7777-777777777777',
        tests.get_supabase_user('confirm_transfer_manager'));
insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, destination_paddock_id)
values ('d8888888-8888-8888-8888-888888888888', 'd1111111-1111-1111-1111-111111111111',
        'd1111111-1111-1111-1111-111111111111', 'd3333333-3333-3333-3333-333333333333');

select tests.authenticate_as('confirm_transfer_manager');

-- Move the existing animal to Potrero 2, and register one brand-new animal
-- into the same paddock with an initial category.
select lives_ok(
  $$ select public.confirm_transfer_batch(
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd4444444-4444-4444-4444-444444444444'::uuid,
       '2026-01-02'::date,
       array['d6666666-6666-6666-6666-666666666666'::uuid],
       '[{"tag": "999", "category_id": "d5555555-5555-5555-5555-555555555555"}]'::jsonb
     ) $$,
  'confirm_transfer_batch runs without error for an existing + a new animal'
);

select is(
  (select current_paddock_id from public.animal_current_state_mv where animal_id = 'd6666666-6666-6666-6666-666666666666'),
  'd4444444-4444-4444-4444-444444444444'::uuid,
  'the existing animal now shows Potrero 2 as its current paddock'
);

select is(
  (select acs.current_tag from public.animal_current_state_mv acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '999'),
  '999',
  'the new animal has current_tag 999, derived from the self-retag event'
);

select is(
  (select acs.current_category_id from public.animal_current_state_mv acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '999'),
  'd5555555-5555-5555-5555-555555555555'::uuid,
  'the new animal has the category from the Excel row, via a self-recategorize event'
);

select is(
  (select count(*) from public.batch_operation where farm_id = 'd1111111-1111-1111-1111-111111111111' and animal_count = 2),
  1::bigint,
  'a single batch_operation was created with animal_count = 2'
);

-- No paddock passed here (null), so this hits the batch_operation RLS
-- check directly instead of the paddock-ownership validation above it.
select throws_like(
  $$ select public.confirm_transfer_batch(
       'd2222222-2222-2222-2222-222222222222'::uuid,
       'd2222222-2222-2222-2222-222222222222'::uuid,
       null::uuid,
       '2026-01-01'::date,
       array[]::uuid[],
       '[]'::jsonb
     ) $$,
  '%row-level security policy%',
  'a manager cannot run this for a farm they are not assigned to'
);

select tests.clear_authentication();

-- Authenticate as admin (not the manager) for this one: admin bypasses the
-- farm-scoping RLS check entirely, so this assertion deterministically
-- exercises the paddock-ownership validation inside the function itself,
-- not the RLS policy tested above.
select tests.authenticate_as('confirm_transfer_admin');

select throws_like(
  $$ select public.confirm_transfer_batch(
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd2222222-2222-2222-2222-222222222222'::uuid,
       '2026-01-01'::date,
       array[]::uuid[],
       '[{"tag": "888", "category_id": null}]'::jsonb
     ) $$,
  '%El potrero destino no pertenece al establecimiento destino%',
  'rejects a destination paddock that belongs to a different farm than the destination farm'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
supabase test db
```

Expected: FAIL — `function public.confirm_transfer_batch(...) does not exist`.

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new create_confirm_transfer_batch
```

Edit the generated file:

```sql
create or replace function public.confirm_transfer_batch(
  p_farm_id uuid,
  p_destination_farm_id uuid,
  p_destination_paddock_id uuid,
  p_event_date date,
  p_existing_animal_ids uuid[],
  p_new_animals jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_batch_id uuid;
  v_animal_count int;
  v_animal_id uuid;
  v_origin_farm_id uuid;
  v_origin_paddock_id uuid;
  v_event_id uuid;
  v_row jsonb;
begin
  if p_destination_paddock_id is not null then
    if not exists (
      select 1 from public.paddock
      where id = p_destination_paddock_id and farm_id = p_destination_farm_id
    ) then
      raise exception 'El potrero destino no pertenece al establecimiento destino.';
    end if;
  end if;

  v_animal_count := coalesce(array_length(p_existing_animal_ids, 1), 0) + jsonb_array_length(p_new_animals);

  insert into public.batch_operation (event_type, farm_id, animal_count, created_by)
  values ('transfer', p_farm_id, v_animal_count, auth.uid())
  returning id into v_batch_id;

  -- Existing animals: origin is looked up server-side from their real
  -- current placement, never trusted from the client, to avoid staleness
  -- between the validation preview and this confirmation call.
  foreach v_animal_id in array p_existing_animal_ids
  loop
    select current_farm_id, current_paddock_id into v_origin_farm_id, v_origin_paddock_id
    from public.animal_current_state
    where animal_id = v_animal_id;

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;

    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, origin_paddock_id, destination_paddock_id)
    values (v_event_id, v_origin_farm_id, p_destination_farm_id, v_origin_paddock_id, p_destination_paddock_id);
  end loop;

  -- New animals: create the animal, then a self-retag (establishes its
  -- initial current_tag), the real transfer to the destination, and an
  -- optional self-recategorize if the Excel row carried a category.
  for v_row in select * from jsonb_array_elements(p_new_animals)
  loop
    insert into public.animal default values returning id into v_animal_id;
    insert into public.animal_tag_history (animal_id, tag) values (v_animal_id, v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('retag', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_retag (event_id, old_tag, new_tag)
    values (v_event_id, v_row->>'tag', v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, destination_paddock_id)
    values (v_event_id, p_farm_id, p_destination_farm_id, p_destination_paddock_id);

    if (v_row->>'category_id') is not null then
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('recategorize', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_recategorize (event_id, old_category_id, new_category_id)
      values (v_event_id, (v_row->>'category_id')::uuid, (v_row->>'category_id')::uuid);
    end if;
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function public.confirm_transfer_batch(uuid, uuid, uuid, date, uuid[], jsonb) to authenticated;
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
supabase test db
```

Expected: PASS — `1..8`, all ok, and all prior test files still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: add confirm_transfer_batch database function"
```

---

## Task 3: Traslado — frontend end to end

**Files:**
- Modify: `web/lib/activities/types.ts` (add `PreviewRow`)
- Create: `web/lib/activities/resolve-batch-rows.ts`
- Create: `web/app/(protected)/actividades/nueva/actions.ts`
- Create: `web/app/(protected)/actividades/nueva/page.tsx`
- Create: `web/components/activities/transfer-form.tsx`
- Create: `web/components/activities/preview-table.tsx`
- Create: `web/components/ui/select.tsx` (shadcn, generated)
- Create: `web/e2e/activity-transfer.spec.ts`

**Interfaces:**
- Consumes: `parseTagExcel` (Task 1), `public.confirm_transfer_batch` RPC (Task 2), `getUserFarms` (`web/lib/farms.ts`, existing), `createClient` server client (existing).
- Produces:
  - `type PreviewRow = { tag: string; kind: 'existing'; animalId: string } | { tag: string; kind: 'new'; categoryId: string | null } | { tag: string; kind: 'error'; reason: string }`.
  - `resolveBatchRows(supabase: SupabaseClient, rows: ParsedExcelRow[]): Promise<PreviewRow[]>` — the row-resolution logic (duplicate detection, existing-vs-new lookup, category name resolution, sold/dead check) is identical regardless of which activity is being loaded, so this one function is shared by both the transfer and the sanidad validators — **Task 5 imports this directly, it does not reimplement it.**
  - Server Actions `validarLoteTraslado(formData: FormData)` and `confirmarLoteTraslado(input)` in `actions.ts`.
  - Route `/actividades/nueva`.

- [ ] **Step 1: Add the shadcn select component**

```bash
cd web
npx shadcn@latest add select -y
```

Expected: creates `web/components/ui/select.tsx`.

- [ ] **Step 2: Write the E2E test (RED)**

Create `web/e2e/activity-transfer.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'

async function buildExcelFile(rows: { tag: string; category?: string }[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Caravanas')
  sheet.addRow(['caravana', 'categoria'])
  for (const row of rows) sheet.addRow([row.tag, row.category ?? ''])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function selectDestinationFarm(page: import('@playwright/test').Page, farmName: string) {
  // shadcn/Radix Select — not a native <select>, so option picking needs a
  // click-to-open, click-the-option sequence rather than selectOption().
  await page.getByLabel('Campo destino').click()
  await page.getByRole('option', { name: farmName }).click()
}

test('uploading an Excel with a new tag shows it as "nueva" in the preview, and confirming creates it', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await page.goto('/actividades/nueva')

  const excel = await buildExcelFile([{ tag: 'e2e-transfer-001', category: '' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await selectDestinationFarm(page, 'Campo Test Uno')
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page.getByText('e2e-transfer-001')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})

test('a duplicate tag in the Excel is shown as an error and blocks confirmation', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await page.goto('/actividades/nueva')

  const excel = await buildExcelFile([{ tag: 'e2e-transfer-dup' }, { tag: 'e2e-transfer-dup' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await selectDestinationFarm(page, 'Campo Test Uno')
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page.getByText(/duplicada/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
})
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-transfer.spec.ts
```

Expected: FAIL — `/actividades/nueva` doesn't exist (404).

- [ ] **Step 4: Implement the validation logic**

Update `web/lib/activities/types.ts`, append:

```ts
export type PreviewRow =
  | { tag: string; kind: 'existing'; animalId: string }
  | { tag: string; kind: 'new'; categoryId: string | null }
  | { tag: string; kind: 'error'; reason: string }
```

Create `web/lib/activities/resolve-batch-rows.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedExcelRow, PreviewRow } from './types'

export async function resolveBatchRows(supabase: SupabaseClient, rows: ParsedExcelRow[]): Promise<PreviewRow[]> {
  const duplicateTags = new Set(
    Object.entries(
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.tag] = (acc[row.tag] ?? 0) + 1
        return acc
      }, {})
    )
      .filter(([, count]) => count > 1)
      .map(([tag]) => tag)
  )

  const tags = [...new Set(rows.map((row) => row.tag))]
  const { data: existingAnimals, error: animalsError } = await supabase
    .from('animal_current_state')
    .select('animal_id, current_tag, status')
    .in('current_tag', tags)
  if (animalsError) throw animalsError

  const categoryNames = [...new Set(rows.map((row) => row.category).filter((c): c is string => !!c))]
  const { data: categories, error: categoriesError } = await supabase
    .from('category')
    .select('id, name')
    .in('name', categoryNames)
  if (categoriesError) throw categoriesError

  const animalByTag = new Map(existingAnimals?.map((a) => [a.current_tag, a]) ?? [])
  const categoryIdByName = new Map(categories?.map((c) => [c.name, c.id]) ?? [])

  return rows.map((row): PreviewRow => {
    if (duplicateTags.has(row.tag)) {
      return { tag: row.tag, kind: 'error', reason: 'Caravana duplicada en el Excel' }
    }

    const existing = animalByTag.get(row.tag)
    if (existing) {
      if (existing.status !== 'alive') {
        return { tag: row.tag, kind: 'error', reason: 'Animal vendido o muerto' }
      }
      return { tag: row.tag, kind: 'existing', animalId: existing.animal_id }
    }

    if (row.category) {
      const categoryId = categoryIdByName.get(row.category)
      if (!categoryId) {
        return { tag: row.tag, kind: 'error', reason: `Categoría "${row.category}" no existe` }
      }
      return { tag: row.tag, kind: 'new', categoryId }
    }

    return { tag: row.tag, kind: 'new', categoryId: null }
  })
}
```

- [ ] **Step 5: Implement the Server Actions**

Create `web/app/(protected)/actividades/nueva/actions.ts`:

```ts
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { parseTagExcel } from '@/lib/activities/parse-tag-excel'
import { resolveBatchRows } from '@/lib/activities/resolve-batch-rows'
import type { PreviewRow } from '@/lib/activities/types'

export async function validarLoteTraslado(
  formData: FormData
): Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; error: string }> {
  const file = formData.get('excel') as File | null
  if (!file) return { ok: false, error: 'No se recibió ningún archivo.' }

  const parsed = await parseTagExcel(await file.arrayBuffer())
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const supabase = await createClient()

  try {
    const rows = await resolveBatchRows(supabase, parsed.rows)
    return { ok: true, rows }
  } catch {
    return { ok: false, error: 'No pudimos validar el lote. Intentá de nuevo en unos minutos.' }
  }
}

export async function confirmarLoteTraslado(input: {
  rows: PreviewRow[]
  destinationFarmId: string
  destinationPaddockId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const operatingFarmId = cookieStore.get('active_farm_id')?.value
  if (!operatingFarmId) return { ok: false, error: 'No se pudo determinar el campo activo.' }

  const existingAnimalIds = input.rows.filter((r) => r.kind === 'existing').map((r) => r.animalId)
  const newAnimals = input.rows
    .filter((r) => r.kind === 'new')
    .map((r) => ({ tag: r.tag, category_id: r.categoryId }))

  const { error } = await supabase.rpc('confirm_transfer_batch', {
    p_farm_id: operatingFarmId,
    p_destination_farm_id: input.destinationFarmId,
    p_destination_paddock_id: input.destinationPaddockId,
    p_event_date: new Date().toISOString().slice(0, 10),
    p_existing_animal_ids: existingAnimalIds,
    p_new_animals: newAnimals,
  })

  if (error) return { ok: false, error: 'No se pudo confirmar el lote. Intentá de nuevo en unos minutos.' }
  return { ok: true }
}
```

- [ ] **Step 6: Implement the preview table component**

Create `web/components/activities/preview-table.tsx`:

```tsx
import type { PreviewRow } from '@/lib/activities/types'

export function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left">
          <th>Caravana</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.tag}>
            <td>{row.tag}</td>
            <td>
              {row.kind === 'existing' && 'Existente'}
              {row.kind === 'new' && 'Nueva'}
              {row.kind === 'error' && row.reason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 7: Implement the form and page**

Create `web/components/activities/transfer-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { validarLoteTraslado, confirmarLoteTraslado } from '@/app/(protected)/actividades/nueva/actions'
import { PreviewTable } from '@/components/activities/preview-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Farm } from '@/lib/farms'
import type { PreviewRow } from '@/lib/activities/types'

export function TransferForm({ farms, paddocksByFarm }: { farms: Farm[]; paddocksByFarm: Record<string, Farm[]> }) {
  const [file, setFile] = useState<File | null>(null)
  const [destinationFarmId, setDestinationFarmId] = useState('')
  const [destinationPaddockId, setDestinationPaddockId] = useState<string | null>(null)
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasErrors = rows?.some((r) => r.kind === 'error') ?? false
  const paddockOptions = destinationFarmId ? (paddocksByFarm[destinationFarmId] ?? []) : []

  const handleValidate = async () => {
    if (!file) return
    setMessage(null)
    const formData = new FormData()
    formData.set('excel', file)
    const result = await validarLoteTraslado(formData)
    if (!result.ok) {
      setMessage(result.error)
      setRows(null)
      return
    }
    setRows(result.rows)
  }

  const handleConfirm = async () => {
    if (!rows) return
    const result = await confirmarLoteTraslado({ rows, destinationFarmId, destinationPaddockId })
    setMessage(result.ok ? 'Lote confirmado.' : result.error)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="excel">Archivo Excel</Label>
        <Input
          id="excel"
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="destination-farm">Campo destino</Label>
        <Select
          value={destinationFarmId}
          onValueChange={(value) => {
            setDestinationFarmId(value)
            setDestinationPaddockId(null)
          }}
        >
          <SelectTrigger id="destination-farm">
            <SelectValue placeholder="Elegí un campo" />
          </SelectTrigger>
          <SelectContent>
            {farms.map((farm) => (
              <SelectItem key={farm.id} value={farm.id}>
                {farm.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {paddockOptions.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="destination-paddock">Potrero destino (opcional)</Label>
          <Select value={destinationPaddockId ?? ''} onValueChange={setDestinationPaddockId}>
            <SelectTrigger id="destination-paddock">
              <SelectValue placeholder="Sin potrero específico" />
            </SelectTrigger>
            <SelectContent>
              {paddockOptions.map((paddock) => (
                <SelectItem key={paddock.id} value={paddock.id}>
                  {paddock.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="button" onClick={handleValidate} disabled={!file || !destinationFarmId}>
        Validar
      </Button>

      {rows && <PreviewTable rows={rows} />}
      {message && <p className="text-sm">{message}</p>}

      <Button type="button" onClick={handleConfirm} disabled={!rows || hasErrors}>
        Confirmar
      </Button>
    </div>
  )
}
```

Create `web/app/(protected)/actividades/nueva/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { getUserFarms, type Farm } from '@/lib/farms'
import { TransferForm } from '@/components/activities/transfer-form'

export default async function NuevaActividadPage() {
  const supabase = await createClient()
  const farms = await getUserFarms(supabase)

  const paddocksByFarm: Record<string, Farm[]> = {}
  for (const farm of farms) {
    const { data } = await supabase.from('paddock').select('id, name').eq('farm_id', farm.id)
    paddocksByFarm[farm.id] = data ?? []
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Nueva actividad: Traslado</h1>
      <TransferForm farms={farms} paddocksByFarm={paddocksByFarm} />
    </div>
  )
}
```

- [ ] **Step 8: Run the E2E test and confirm it passes**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-transfer.spec.ts
```

Expected: PASS — both tests green.

- [ ] **Step 9: Run the full suite and confirm no regression**

```bash
npm run test
npx playwright test
```

Expected: PASS — all Vitest and Playwright tests green, not just this file's.

- [ ] **Step 10: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web
git commit -m "feat: add traslado activity loading flow (Excel upload, preview, confirm)"
```

---

## Task 4: `confirm_health_batch` database function

**Files:**
- Create: `supabase/migrations/<timestamp>_create_confirm_health_batch.sql`
- Create: `supabase/tests/12_confirm_health_batch.sql`

**Interfaces:**
- Produces: `public.confirm_health_batch(p_farm_id uuid, p_product_id uuid, p_dose numeric, p_dose_unit text, p_route text, p_withdrawal_days int, p_event_date date, p_existing_animal_ids uuid[], p_new_animals jsonb) returns uuid`.
- Consumes: same base tables as Task 2, plus `public.product`, `public.event_health`.

- [ ] **Step 1: Write the failing test (RED)**

Create `supabase/tests/12_confirm_health_batch.sql`:

```sql
begin;
select plan(6);

select has_function('public', 'confirm_health_batch', 'confirm_health_batch function exists');

insert into public.farm (id, name) values ('e1111111-1111-1111-1111-111111111111', 'Campo Norte');
insert into public.product (id, name, default_dose_unit, default_withdrawal_days)
values ('e2222222-2222-2222-2222-222222222222', 'Ivermectina 1%', 'ml', 21);
insert into public.category (id, name) values ('e3333333-3333-3333-3333-333333333333', 'Vaca');

select tests.create_supabase_user('confirm_health_manager', 'confirm_health_manager@test.local', 'manager');
insert into public.user_farm (user_id, farm_id)
values (tests.get_supabase_user('confirm_health_manager'), 'e1111111-1111-1111-1111-111111111111');

-- An existing animal already placed in Campo Norte.
insert into public.animal (id) values ('e4444444-4444-4444-4444-444444444444');
insert into public.batch_operation (id, event_type, farm_id, animal_count, created_by)
values ('e5555555-5555-5555-5555-555555555555', 'transfer', 'e1111111-1111-1111-1111-111111111111', 1,
        tests.get_supabase_user('confirm_health_manager'));
insert into public.event (id, event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
values ('e6666666-6666-6666-6666-666666666666', 'transfer', '2026-01-01', 'e4444444-4444-4444-4444-444444444444',
        'e1111111-1111-1111-1111-111111111111', 'e5555555-5555-5555-5555-555555555555',
        tests.get_supabase_user('confirm_health_manager'));
insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id)
values ('e6666666-6666-6666-6666-666666666666', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111');

select tests.authenticate_as('confirm_health_manager');

select lives_ok(
  $$ select public.confirm_health_batch(
       'e1111111-1111-1111-1111-111111111111'::uuid,
       'e2222222-2222-2222-2222-222222222222'::uuid,
       10, 'ml', 'subcutánea', 21,
       '2026-01-02'::date,
       array['e4444444-4444-4444-4444-444444444444'::uuid],
       '[{"tag": "777", "category_id": "e3333333-3333-3333-3333-333333333333"}]'::jsonb
     ) $$,
  'confirm_health_batch runs without error for an existing + a new animal'
);

select is(
  (select count(*) from public.event_health where dose = 10 and dose_unit = 'ml')::int, 2,
  'both the existing and the new animal got an event_health row with the same product/dose'
);

select is(
  (select current_farm_id from public.animal_current_state_mv acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '777'),
  'e1111111-1111-1111-1111-111111111111'::uuid,
  'the new animal is placed in the operating farm via the internal self-transfer'
);

select is(
  (select current_paddock_id from public.animal_current_state_mv acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '777'),
  null::uuid,
  'the internal self-transfer for a new animal never sets a paddock'
);

select is(
  (select count(*) from public.batch_operation where event_type = 'health' and animal_count = 2),
  1::bigint,
  'a single batch_operation was created with event_type health and animal_count = 2'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
supabase test db
```

Expected: FAIL — `function public.confirm_health_batch(...) does not exist`.

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new create_confirm_health_batch
```

Edit the generated file:

```sql
create or replace function public.confirm_health_batch(
  p_farm_id uuid,
  p_product_id uuid,
  p_dose numeric,
  p_dose_unit text,
  p_route text,
  p_withdrawal_days int,
  p_event_date date,
  p_existing_animal_ids uuid[],
  p_new_animals jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_batch_id uuid;
  v_animal_count int;
  v_animal_id uuid;
  v_event_id uuid;
  v_row jsonb;
begin
  v_animal_count := coalesce(array_length(p_existing_animal_ids, 1), 0) + jsonb_array_length(p_new_animals);

  insert into public.batch_operation (event_type, farm_id, animal_count, created_by)
  values ('health', p_farm_id, v_animal_count, auth.uid())
  returning id into v_batch_id;

  foreach v_animal_id in array p_existing_animal_ids
  loop
    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('health', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_health (event_id, product_id, dose, dose_unit, route, withdrawal_days)
    values (v_event_id, p_product_id, p_dose, p_dose_unit, p_route, p_withdrawal_days);
  end loop;

  for v_row in select * from jsonb_array_elements(p_new_animals)
  loop
    insert into public.animal default values returning id into v_animal_id;
    insert into public.animal_tag_history (animal_id, tag) values (v_animal_id, v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('retag', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_retag (event_id, old_tag, new_tag)
    values (v_event_id, v_row->>'tag', v_row->>'tag');

    -- Internal self-transfer: places the new animal in the operating farm.
    -- Not a real traslado the user chose, and never carries a paddock.
    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id)
    values (v_event_id, p_farm_id, p_farm_id);

    if (v_row->>'category_id') is not null then
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('recategorize', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_recategorize (event_id, old_category_id, new_category_id)
      values (v_event_id, (v_row->>'category_id')::uuid, (v_row->>'category_id')::uuid);
    end if;

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('health', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_health (event_id, product_id, dose, dose_unit, route, withdrawal_days)
    values (v_event_id, p_product_id, p_dose, p_dose_unit, p_route, p_withdrawal_days);
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function public.confirm_health_batch(uuid, uuid, numeric, text, text, int, date, uuid[], jsonb) to authenticated;
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
supabase test db
```

Expected: PASS — `1..6`, all ok, all prior test files still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: add confirm_health_batch database function"
```

---

## Task 5: Sanidad — frontend end to end

**Files:**
- Modify: `web/app/(protected)/actividades/nueva/actions.ts` (add `validarLoteSanidad`, `confirmarLoteSanidad`)
- Modify: `web/app/(protected)/actividades/nueva/page.tsx` (activity type selector)
- Create: `web/components/activities/health-form.tsx`
- Create: `web/e2e/activity-health.spec.ts`

**Interfaces:**
- Consumes: `parseTagExcel` (Task 1), `resolveBatchRows`, `PreviewRow`/`ParsedExcelRow` (Task 3 — reused as-is, not reimplemented), `public.confirm_health_batch` RPC (Task 4).
- Produces: nothing new beyond the two Server Actions — this task adds no new shared library code, only wiring.

- [ ] **Step 1: Write the E2E test (RED)**

Create `web/e2e/activity-health.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'

async function buildExcelFile(rows: { tag: string; category?: string }[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Caravanas')
  sheet.addRow(['caravana', 'categoria'])
  for (const row of rows) sheet.addRow([row.tag, row.category ?? ''])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test('sanidad on a new tag creates the animal, places it, and prefills the product withdrawal period', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e.manager.one.farm@test.local')
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/actividades/nueva')
  await page.getByLabel('Tipo de actividad').selectOption('Sanidad')

  await page.getByLabel('Producto').selectOption({ label: 'Ivermectina 1%' })
  await expect(page.getByLabel('Días de carencia')).toHaveValue('21')

  const excel = await buildExcelFile([{ tag: 'e2e-health-001' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await page.getByLabel('Dosis').fill('10')
  await page.getByLabel('Unidad de dosis').fill('ml')
  await page.getByLabel('Vía de administración').fill('subcutánea')

  await page.getByRole('button', { name: 'Validar' }).click()
  await expect(page.getByText('e2e-health-001')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})
```

This test requires an `Ivermectina 1%` product to exist. Add it to `supabase/seed.sql` if it isn't already there as part of implementing this task (check first — `grep -i ivermectina supabase/seed.sql`).

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-health.spec.ts
```

Expected: FAIL — no "Tipo de actividad" selector exists yet (the page only renders the transfer form).

- [ ] **Step 3: Seed a test product**

If `supabase/seed.sql` doesn't already have an `Ivermectina 1%` product, append:

```sql
insert into public.product (name, default_dose_unit, default_withdrawal_days)
values ('Ivermectina 1%', 'ml', 21)
on conflict (name) do nothing;
```

- [ ] **Step 4: Add the Server Actions**

Sanidad's row-resolution needs are identical to traslado's — same duplicate/existing/category-name checks — so this step reuses `resolveBatchRows` from Task 3 rather than reimplementing it.

Append to `web/app/(protected)/actividades/nueva/actions.ts`:

```ts
export async function validarLoteSanidad(
  formData: FormData
): Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; error: string }> {
  const file = formData.get('excel') as File | null
  if (!file) return { ok: false, error: 'No se recibió ningún archivo.' }

  const parsed = await parseTagExcel(await file.arrayBuffer())
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const supabase = await createClient()
  try {
    const rows = await resolveBatchRows(supabase, parsed.rows)
    return { ok: true, rows }
  } catch {
    return { ok: false, error: 'No pudimos validar el lote. Intentá de nuevo en unos minutos.' }
  }
}

export async function confirmarLoteSanidad(input: {
  rows: PreviewRow[]
  productId: string
  dose: number
  doseUnit: string
  route: string
  withdrawalDays: number | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const operatingFarmId = cookieStore.get('active_farm_id')?.value
  if (!operatingFarmId) return { ok: false, error: 'No se pudo determinar el campo activo.' }

  const existingAnimalIds = input.rows.filter((r) => r.kind === 'existing').map((r) => r.animalId)
  const newAnimals = input.rows
    .filter((r) => r.kind === 'new')
    .map((r) => ({ tag: r.tag, category_id: r.categoryId }))

  const { error } = await supabase.rpc('confirm_health_batch', {
    p_farm_id: operatingFarmId,
    p_product_id: input.productId,
    p_dose: input.dose,
    p_dose_unit: input.doseUnit,
    p_route: input.route,
    p_withdrawal_days: input.withdrawalDays,
    p_event_date: new Date().toISOString().slice(0, 10),
    p_existing_animal_ids: existingAnimalIds,
    p_new_animals: newAnimals,
  })

  if (error) return { ok: false, error: 'No se pudo confirmar el lote. Intentá de nuevo en unos minutos.' }
  return { ok: true }
}
```

- [ ] **Step 5: Implement the health form**

Create `web/components/activities/health-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { validarLoteSanidad, confirmarLoteSanidad } from '@/app/(protected)/actividades/nueva/actions'
import { PreviewTable } from '@/components/activities/preview-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PreviewRow } from '@/lib/activities/types'

type Product = { id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }

export function HealthForm({ products }: { products: Product[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [productId, setProductId] = useState('')
  const [dose, setDose] = useState('')
  const [doseUnit, setDoseUnit] = useState('')
  const [route, setRoute] = useState('')
  const [withdrawalDays, setWithdrawalDays] = useState('')
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasErrors = rows?.some((r) => r.kind === 'error') ?? false

  const handleProductChange = (id: string) => {
    setProductId(id)
    const product = products.find((p) => p.id === id)
    if (product) {
      setDoseUnit(product.defaultDoseUnit ?? '')
      setWithdrawalDays(product.defaultWithdrawalDays?.toString() ?? '')
    }
  }

  const handleValidate = async () => {
    if (!file) return
    setMessage(null)
    const formData = new FormData()
    formData.set('excel', file)
    const result = await validarLoteSanidad(formData)
    if (!result.ok) {
      setMessage(result.error)
      setRows(null)
      return
    }
    setRows(result.rows)
  }

  const handleConfirm = async () => {
    if (!rows) return
    const result = await confirmarLoteSanidad({
      rows,
      productId,
      dose: Number(dose),
      doseUnit,
      route,
      withdrawalDays: withdrawalDays ? Number(withdrawalDays) : null,
    })
    setMessage(result.ok ? 'Lote confirmado.' : result.error)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="excel">Archivo Excel</Label>
        <Input id="excel" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="product">Producto</Label>
        <select
          id="product"
          value={productId}
          onChange={(e) => handleProductChange(e.target.value)}
          className="border rounded-md h-9 px-2"
        >
          <option value="">Elegí un producto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="dose">Dosis</Label>
        <Input id="dose" type="number" value={dose} onChange={(e) => setDose(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="dose-unit">Unidad de dosis</Label>
        <Input id="dose-unit" value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="route">Vía de administración</Label>
        <Input id="route" value={route} onChange={(e) => setRoute(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="withdrawal-days">Días de carencia</Label>
        <Input
          id="withdrawal-days"
          type="number"
          value={withdrawalDays}
          onChange={(e) => setWithdrawalDays(e.target.value)}
        />
      </div>

      <Button type="button" onClick={handleValidate} disabled={!file || !productId}>
        Validar
      </Button>

      {rows && <PreviewTable rows={rows} />}
      {message && <p className="text-sm">{message}</p>}

      <Button type="button" onClick={handleConfirm} disabled={!rows || hasErrors}>
        Confirmar
      </Button>
    </div>
  )
}
```

- [ ] **Step 6: Wire the activity type selector into the page**

Replace `web/app/(protected)/actividades/nueva/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TransferForm } from '@/components/activities/transfer-form'
import { HealthForm } from '@/components/activities/health-form'
import { Label } from '@/components/ui/label'
import type { Farm } from '@/lib/farms'

type Product = { id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }

export default function NuevaActividadPage() {
  const [activityType, setActivityType] = useState<'transfer' | 'health'>('transfer')
  const [farms, setFarms] = useState<Farm[]>([])
  const [paddocksByFarm, setPaddocksByFarm] = useState<Record<string, Farm[]>>({})
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('farm')
      .select('id, name')
      .order('name')
      .then(async ({ data: farmRows }) => {
        setFarms(farmRows ?? [])
        const byFarm: Record<string, Farm[]> = {}
        for (const farm of farmRows ?? []) {
          const { data: paddockRows } = await supabase.from('paddock').select('id, name').eq('farm_id', farm.id)
          byFarm[farm.id] = paddockRows ?? []
        }
        setPaddocksByFarm(byFarm)
      })
    supabase
      .from('product')
      .select('id, name, default_dose_unit, default_withdrawal_days')
      .order('name')
      .then(({ data }) => {
        setProducts(
          (data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            defaultDoseUnit: p.default_dose_unit,
            defaultWithdrawalDays: p.default_withdrawal_days,
          }))
        )
      })
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Nueva actividad</h1>

      <div className="grid gap-2 mb-4">
        <Label htmlFor="activity-type">Tipo de actividad</Label>
        <select
          id="activity-type"
          value={activityType === 'transfer' ? 'Traslado' : 'Sanidad'}
          onChange={(e) => setActivityType(e.target.value === 'Traslado' ? 'transfer' : 'health')}
          className="border rounded-md h-9 px-2"
        >
          <option value="Traslado">Traslado</option>
          <option value="Sanidad">Sanidad</option>
        </select>
      </div>

      {activityType === 'transfer' ? (
        <TransferForm farms={farms} paddocksByFarm={paddocksByFarm} />
      ) : (
        <HealthForm products={products} />
      )}
    </div>
  )
}
```

This replaces the Task 3 version of the page (which was a Server Component fetching farms/paddocks server-side) with a Client Component that fetches via the browser client, since the activity-type toggle needs client-side state. Data access is still fully RLS-scoped — `createClient()` here is the same cookie-backed browser client used elsewhere in the app (`web/lib/supabase/client.ts`), not a service-role client.

- [ ] **Step 7: Run the E2E test and confirm it passes**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-health.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Run the full suite and confirm no regression**

```bash
npm run test
npx playwright test
```

Expected: PASS — every Vitest and Playwright test green, including `activity-transfer.spec.ts` from Task 3 (the page rewrite in Step 6 must not break it).

- [ ] **Step 9: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web supabase/seed.sql
git commit -m "feat: add sanidad activity loading flow with product-prefilled withdrawal period"
```

---

## Post-plan note

This plan implements the two reference activities (traslado, sanidad) from the spec. Recategorización, venta, and baja follow the same pattern (a `confirm_<activity>_batch` RPC function + a form component) and are separate follow-up plans, as is the natural-language-criteria or checkbox-table alternative to Excel-based lote selection.
