# Activity Loading — Manual Column Mapping, Multi-Product Sanidad, Sex/Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Revisión" section of [`docs/superpowers/specs/2026-07-20-activity-loading-design.md`](../specs/2026-07-20-activity-loading-design.md) on top of the already-merged traslado/sanidad activity-loading feature: replace fixed-column-name Excel detection with a manual, remembered column-mapping step; let a sanidad batch apply multiple products per animal; and add `sex`/`owner_id` as fixed (non-versioned) animal attributes with a new `owner` catalog.

**Architecture:** The Excel is now parsed generically (headers + raw string rows, no name-based column detection at all). A new `column_mapping` table remembers, per exact header signature, which meaning ("Caravana", "Fecha", "Categoría", "Sexo", "Propietario", "Producto", "Ignorar") the user assigned to each column — shared account-wide. Applying a mapping to raw rows and resolving those rows against the database are separate pure/impure layers, mirroring the existing `parseTagExcel` → `resolveBatchRows` split. `confirm_transfer_batch` and `confirm_health_batch` both change signature: per-row event dates and new-animal `sex`/`owner_id` replace the old single `p_event_date` parameter, and `confirm_health_batch` takes an array of products instead of one.

**Tech Stack:** Same as the existing feature (`web/` Next.js app, `exceljs`, Supabase/Postgres with pgTAP, Playwright, Vitest). No new dependencies.

## Global Constraints

- No service-role key anywhere — every RPC function stays `security invoker`.
- All UI copy in Spanish.
- The uploaded Excel is never persisted (not to disk, not to a database table).
- If any row has a validation error (duplicate tag, sold/dead animal, unknown category name, unknown owner name), confirmation is blocked for the whole batch — no partial application.
- **Column mapping is remembered per exact header signature (name + order), shared across the whole account** — not scoped by farm, user, or activity type (spec: "compartido para toda la cuenta — no por establecimiento ni por usuario"). An activity's row-resolution logic simply ignores mapping meanings that don't apply to it (e.g. a `product`-mapped column is inert for traslado).
- **`sex` and `owner_id` are fixed, non-versioned attributes stored directly on `public.animal`** (spec: "a diferencia de campo/categoría/caravana... ambos son datos fijos, no versionados") — unlike `current_farm_id`/`current_category_id`/`current_tag`, they are never derived from events and never touched for an animal that already exists.
- **Unmatched category or owner names block the row** (same catalog-lookup treatment for both — spec: "mismo criterio que categoría" for owner). **Unmatched or unrecognized `sex` values never block a row** — there's no catalog to violate, so an unrecognized value is simply left null on the new animal.
- **A mapped "Producto" column only prefills the sanidad form's product list from that column's (assumed-uniform) value** — it does not vary the applied product per Excel row. The batch's actual product list — one entry per product, each with its own dose/unit/route/carencia — is what the confirm step applies uniformly to every animal in the lote, exactly as before this revision, just now as a list instead of a single product.
- **A mapped "Fecha" column overrides the form's chosen event date on a per-row basis**; if the column isn't mapped, or a given row's value doesn't parse, that row falls back to the date entered in the form. This is why the form now has an explicit, user-editable event-date field (previously hardcoded to "today" inside the Server Action).
- A newly-created animal's initial tag/farm/category are established via *self-referencing* events (unchanged from before this revision) — `sex`/`owner_id`, being non-versioned, are set as plain columns on the `animal` insert instead, no event involved.
- A destination paddock, when provided, must belong to the destination farm — validated in the RPC function (unchanged).

---

## Task 1: `owner` catalog + `animal.sex`/`animal.owner_id`

**Files:**
- Create: `supabase/migrations/20260720160512_create_owner_and_animal_attributes.sql`
- Create: `supabase/tests/13_owner_animal_attributes.sql`

**Interfaces:**
- Consumes: `public.animal`, `public.animal_current_state_mv`, `public.is_admin()`, `public.user_farm_ids()` (all existing).
- Produces: `public.owner(id uuid, name text)`; `public.animal.sex text` (check `in ('M','H')`, nullable); `public.animal.owner_id uuid` (fk → `owner`, nullable); `public.animal_current_state`/`animal_current_state_mv` gain passthrough `sex`, `owner_id` columns (not derived — copied straight from `animal`).

- [ ] **Step 1: Write the failing test (RED)**

Create `supabase/tests/13_owner_animal_attributes.sql`:

```sql
begin;
select plan(9);

select has_table('public', 'owner', 'owner table exists');
select col_is_pk('public', 'owner', 'id', 'owner.id is pk');
select col_not_null('public', 'owner', 'name', 'owner.name is not null');

select has_column('public', 'animal', 'sex', 'animal has sex');
select has_column('public', 'animal', 'owner_id', 'animal has owner_id');
select fk_ok('animal', 'owner_id', 'owner', 'id');

insert into public.owner (id, name) values ('f1111111-1111-1111-1111-111111111111', 'Estancia La Postrera');

select tests.create_supabase_user('owner_manager', 'owner_manager@test.local', 'manager');
select tests.authenticate_as('owner_manager');
select is((select count(*) from public.owner)::int, 1, 'manager can read the owner catalog');
select throws_like(
  $$ insert into public.owner (name) values ('Otro dueño') $$,
  '%row-level security policy for table "owner"%',
  'manager cannot write to the owner catalog (write is admin-only, same as category/product)'
);
select tests.clear_authentication();

select throws_like(
  $$ insert into public.animal (id, sex) values (gen_random_uuid(), 'X') $$,
  '%animal_sex_check%',
  'animal.sex rejects a value outside M/H'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase test db
```

Expected: FAIL — `relation "owner" does not exist` (and related failures).

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new create_owner_and_animal_attributes
```

Rename the generated file to `supabase/migrations/20260720160512_create_owner_and_animal_attributes.sql` and replace its contents with:

```sql
create table public.owner (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

grant select, insert, update, delete on public.owner to authenticated;

alter table public.owner enable row level security;

create policy owner_select on public.owner for select to authenticated using (true);
create policy owner_write on public.owner for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Fixed, non-versioned animal attributes (spec: "a diferencia de campo/
-- categoría/caravana... ambos son datos fijos, no versionados"). Unlike
-- current_farm_id/current_category_id/current_tag, these live directly on
-- public.animal instead of being derived from events.
alter table public.animal add column sex text check (sex in ('M', 'H'));
alter table public.animal add column owner_id uuid references public.owner(id);

-- Materialized views have no `ALTER ... AS` to add a computed column — the
-- defining query can only be replaced via DROP + CREATE. This drops every
-- object that depends on animal_current_state_mv, in dependency order, and
-- recreates each one identically except for the two added passthrough
-- columns below (same precedent as
-- 20260720134843_add_paddock_to_derived_state.sql).

drop policy animal_tag_history_select on public.animal_tag_history;
drop policy animal_select on public.animal;
drop view public.animal_current_state;

drop trigger event_death_refresh_animal_current_state on public.event_death;
drop trigger event_sale_refresh_animal_current_state on public.event_sale;
drop trigger event_recategorize_refresh_animal_current_state on public.event_recategorize;
drop trigger event_retag_refresh_animal_current_state on public.event_retag;
drop trigger event_health_refresh_animal_current_state on public.event_health;
drop trigger event_transfer_refresh_animal_current_state on public.event_transfer;
drop trigger event_refresh_animal_current_state on public.event;

drop function public.refresh_animal_current_state();
drop materialized view public.animal_current_state_mv;

create materialized view public.animal_current_state_mv as
with active_event as (
  select e.*
  from public.event e
  where e.event_type <> 'void'
    and not exists (
      select 1 from public.event v
      where v.event_type = 'void' and v.voids_event_id = e.id
    )
),
last_retag as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_tag
  from active_event ae
  join public.event_retag r on r.event_id = ae.id
  where ae.event_type = 'retag'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_transfer as (
  select distinct on (ae.animal_id) ae.animal_id, t.destination_farm_id, t.destination_paddock_id
  from active_event ae
  join public.event_transfer t on t.event_id = ae.id
  where ae.event_type = 'transfer'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_recategorize as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_category_id
  from active_event ae
  join public.event_recategorize r on r.event_id = ae.id
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
  a.sex,
  a.owner_id,
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
from public.animal a
left join last_retag lr on lr.animal_id = a.id
left join last_transfer lt on lt.animal_id = a.id
left join last_recategorize lc on lc.animal_id = a.id
left join last_sale ls on ls.animal_id = a.id
left join last_death ld on ld.animal_id = a.id;

create unique index animal_current_state_mv_animal_id_idx on public.animal_current_state_mv(animal_id);

create or replace function public.refresh_animal_current_state()
returns trigger
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.animal_current_state_mv;
  return null;
end;
$$;

create trigger event_refresh_animal_current_state
after insert on public.event
for each statement
execute function public.refresh_animal_current_state();

create trigger event_transfer_refresh_animal_current_state
after insert on public.event_transfer
for each statement
execute function public.refresh_animal_current_state();

create trigger event_health_refresh_animal_current_state
after insert on public.event_health
for each statement
execute function public.refresh_animal_current_state();

create trigger event_retag_refresh_animal_current_state
after insert on public.event_retag
for each statement
execute function public.refresh_animal_current_state();

create trigger event_recategorize_refresh_animal_current_state
after insert on public.event_recategorize
for each statement
execute function public.refresh_animal_current_state();

create trigger event_sale_refresh_animal_current_state
after insert on public.event_sale
for each statement
execute function public.refresh_animal_current_state();

create trigger event_death_refresh_animal_current_state
after insert on public.event_death
for each statement
execute function public.refresh_animal_current_state();

create view public.animal_current_state
as
select *
from public.animal_current_state_mv
where public.is_admin() or current_farm_id in (select public.user_farm_ids());

grant select on public.animal_current_state to authenticated;

create policy animal_select on public.animal for select to authenticated using (
  public.is_admin()
  or exists (
    select 1 from public.animal_current_state acs
    where acs.animal_id = animal.id and acs.current_farm_id in (select public.user_farm_ids())
  )
);

create policy animal_tag_history_select on public.animal_tag_history for select to authenticated using (
  public.is_admin()
  or exists (
    select 1 from public.animal_current_state acs
    where acs.animal_id = animal_tag_history.animal_id and acs.current_farm_id in (select public.user_farm_ids())
  )
);
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
supabase test db
```

Expected: PASS — `1..9`, all ok, and all prior test files still pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add supabase/migrations supabase/tests
git commit -m "feat: add owner catalog and fixed sex/owner animal attributes"
```

---

## Task 2: `column_mapping` table

**Files:**
- Create: `supabase/migrations/20260720161034_create_column_mapping.sql`
- Create: `supabase/tests/14_column_mapping.sql`

**Interfaces:**
- Produces: `public.column_mapping(id uuid, header_signature text unique, mapping jsonb, created_at timestamptz)`.

- [ ] **Step 1: Write the failing test (RED)**

Create `supabase/tests/14_column_mapping.sql`:

```sql
begin;
select plan(6);

select has_table('public', 'column_mapping', 'column_mapping table exists');
select col_is_pk('public', 'column_mapping', 'id', 'column_mapping.id is pk');
select col_not_null('public', 'column_mapping', 'mapping', 'column_mapping.mapping is not null');

select tests.create_supabase_user('mapping_manager', 'mapping_manager@test.local', 'manager');
select tests.authenticate_as('mapping_manager');

select lives_ok(
  $$ insert into public.column_mapping (header_signature, mapping)
     values ('["IDE","SANIDAD"]', '[{"header":"IDE","meaning":"tag"},{"header":"SANIDAD","meaning":"product"}]'::jsonb) $$,
  'an ordinary authenticated user can save a new column mapping'
);

select throws_like(
  $$ insert into public.column_mapping (header_signature, mapping)
     values ('["IDE","SANIDAD"]', '[]'::jsonb) $$,
  '%duplicate key value violates unique constraint%',
  'header_signature is unique — a repeat signature must upsert, not insert'
);

select lives_ok(
  $$ update public.column_mapping set mapping = '[{"header":"IDE","meaning":"tag"}]'::jsonb
     where header_signature = '["IDE","SANIDAD"]' $$,
  'an ordinary authenticated user can update (correct) an existing mapping'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
supabase test db
```

Expected: FAIL — `relation "column_mapping" does not exist`.

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new create_column_mapping
```

Rename the generated file to `supabase/migrations/20260720161034_create_column_mapping.sql` and replace its contents with:

```sql
-- Remembers which meaning ("Caravana", "Fecha", "Categoría", "Sexo",
-- "Propietario", "Producto", "Ignorar") the user assigned to each column of
-- an uploaded Excel, keyed by the exact header signature (see
-- computeHeaderSignature in web/lib/activities/column-mapping.ts) so the
-- next upload with the same headers/order applies it automatically. Shared
-- across the whole account (spec: "compartido para toda la cuenta — no por
-- establecimiento ni por usuario"), not scoped by activity type: the same
-- signature can't realistically appear for both traslado and sanidad
-- exports (their source readers produce structurally different columns),
-- and even if it did, an activity's resolver simply ignores meanings that
-- don't apply to it (e.g. "product" is inert outside sanidad).
create table public.column_mapping (
  id uuid primary key default gen_random_uuid(),
  header_signature text not null unique,
  mapping jsonb not null,
  created_at timestamptz not null default now()
);

-- No delete grant/policy: mappings are only ever created or corrected
-- (upserted), never removed, by design — YAGNI until a real need shows up.
grant select, insert, update on public.column_mapping to authenticated;

alter table public.column_mapping enable row level security;

-- Not sensitive data (just a header-name-to-meaning dictionary) and
-- deliberately not admin-gated: any manager uploading a new file format is
-- the one who maps it by hand, per spec.
create policy column_mapping_select on public.column_mapping for select to authenticated using (true);
create policy column_mapping_write on public.column_mapping for all to authenticated using (true) with check (true);
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
git commit -m "feat: add column_mapping table for remembered Excel header mappings"
```

---

## Task 3: Raw Excel parsing + column-mapping logic (pure functions)

**Files:**
- Modify: `web/lib/activities/types.ts`
- Create: `web/lib/activities/parse-raw-excel.ts`
- Create: `web/lib/activities/column-mapping.ts`
- Delete: `web/lib/activities/parse-tag-excel.ts`
- Create: `web/__tests__/parse-raw-excel.test.ts`
- Create: `web/__tests__/column-mapping.test.ts`
- Delete: `web/__tests__/parse-tag-excel.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions, no DB, no earlier task's frontend code).
- Produces:
  - `type ActivityType = 'transfer' | 'health'`
  - `type ColumnMeaning = 'tag' | 'date' | 'category' | 'sex' | 'owner' | 'product' | 'ignore'`
  - `type ColumnMapping = { header: string; meaning: ColumnMeaning }[]`
  - `type RawExcelResult = { ok: true; headers: string[]; rows: string[][] } | { ok: false; error: string }`
  - `type MappedRow = { tag: string; category?: string; sex?: string; owner?: string; date?: string }`
  - `type PreviewRow = { tag: string; kind: 'existing'; animalId: string; eventDate: string } | { tag: string; kind: 'new'; categoryId: string | null; ownerId: string | null; sex: 'M' | 'H' | null; eventDate: string } | { tag: string; kind: 'error'; reason: string }`
  - `parseRawExcel(buffer: ArrayBuffer): Promise<RawExcelResult>`
  - `computeHeaderSignature(headers: string[]): string`
  - `validateColumnMapping(mapping: ColumnMapping, activityType: ActivityType): string | null`
  - `applyColumnMapping(headers: string[], rows: string[][], mapping: ColumnMapping): MappedRow[]`
  - `extractProductSuggestions(headers: string[], rows: string[][], mapping: ColumnMapping): string[]`

- [ ] **Step 1: Delete the old fixed-column-name parser and its test**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git rm web/lib/activities/parse-tag-excel.ts web/__tests__/parse-tag-excel.test.ts
```

- [ ] **Step 2: Write the failing tests (RED)**

Replace `web/lib/activities/types.ts` entirely with:

```ts
export type ActivityType = 'transfer' | 'health'

export type ColumnMeaning = 'tag' | 'date' | 'category' | 'sex' | 'owner' | 'product' | 'ignore'

export type ColumnMapping = { header: string; meaning: ColumnMeaning }[]

export type RawExcelResult = { ok: true; headers: string[]; rows: string[][] } | { ok: false; error: string }

export type MappedRow = {
  tag: string
  category?: string
  sex?: string
  owner?: string
  date?: string
}

export type PreviewRow =
  | { tag: string; kind: 'existing'; animalId: string; eventDate: string }
  | {
      tag: string
      kind: 'new'
      categoryId: string | null
      ownerId: string | null
      sex: 'M' | 'H' | null
      eventDate: string
    }
  | { tag: string; kind: 'error'; reason: string }
```

Create `web/__tests__/parse-raw-excel.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseRawExcel } from '@/lib/activities/parse-raw-excel'

async function buildExcelBuffer(headers: string[], rows: (string | undefined)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Datos')
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

describe('parseRawExcel', () => {
  test('extracts headers and raw string rows with no column-name detection', async () => {
    const buffer = await buildExcelBuffer(['IDE', 'SEXO'], [['123', 'H'], ['456', 'M']])
    const result = await parseRawExcel(buffer)
    expect(result).toEqual({
      ok: true,
      headers: ['IDE', 'SEXO'],
      rows: [
        ['123', 'H'],
        ['456', 'M'],
      ],
    })
  })

  test('skips fully empty rows', async () => {
    const buffer = await buildExcelBuffer(['IDE'], [['123'], [undefined], ['456']])
    const result = await parseRawExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toEqual([['123'], ['456']])
  })

  test('pads missing trailing cells in a row to empty strings', async () => {
    const buffer = await buildExcelBuffer(['IDE', 'SEXO'], [['123', undefined]])
    const result = await parseRawExcel(buffer)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows).toEqual([['123', '']])
  })

  test('returns an error when the workbook has no worksheet', async () => {
    const workbook = new ExcelJS.Workbook()
    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
    const result = await parseRawExcel(buffer)
    expect(result).toEqual({ ok: false, error: 'El archivo no tiene ninguna hoja.' })
  })

  test('returns an error when the header row is entirely blank', async () => {
    const buffer = await buildExcelBuffer(['', ''], [['123', 'H']])
    const result = await parseRawExcel(buffer)
    expect(result).toEqual({ ok: false, error: 'El Excel no tiene encabezados.' })
  })
})
```

Create `web/__tests__/column-mapping.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import {
  applyColumnMapping,
  computeHeaderSignature,
  extractProductSuggestions,
  validateColumnMapping,
} from '@/lib/activities/column-mapping'
import type { ColumnMapping } from '@/lib/activities/types'

describe('computeHeaderSignature', () => {
  test('is identical for the same headers in the same order', () => {
    expect(computeHeaderSignature(['IDE', 'SEXO'])).toEqual(computeHeaderSignature(['IDE', 'SEXO']))
  })

  test('differs when the order changes', () => {
    expect(computeHeaderSignature(['IDE', 'SEXO'])).not.toEqual(computeHeaderSignature(['SEXO', 'IDE']))
  })

  test('differs when a header name changes', () => {
    expect(computeHeaderSignature(['IDE', 'SEXO'])).not.toEqual(computeHeaderSignature(['IDE', 'SEXO2']))
  })
})

describe('validateColumnMapping', () => {
  test('requires exactly one column mapped as tag', () => {
    const mapping: ColumnMapping = [{ header: 'IDE', meaning: 'ignore' }]
    expect(validateColumnMapping(mapping, 'transfer')).toEqual('Tenés que asignar exactamente una columna como "Caravana".')
  })

  test('accepts a mapping with exactly one tag column and nothing else mapped', () => {
    const mapping: ColumnMapping = [{ header: 'IDE', meaning: 'tag' }]
    expect(validateColumnMapping(mapping, 'transfer')).toBeNull()
  })

  test('rejects two columns mapped as category', () => {
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'CAT1', meaning: 'category' },
      { header: 'CAT2', meaning: 'category' },
    ]
    expect(validateColumnMapping(mapping, 'transfer')).toEqual('Solo podés asignar una columna como "Categoría".')
  })

  test('rejects a product-mapped column for traslado', () => {
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'SANIDAD', meaning: 'product' },
    ]
    expect(validateColumnMapping(mapping, 'transfer')).toEqual('La columna "Producto" solo se puede usar en sanidad.')
  })

  test('accepts multiple product-mapped columns for sanidad', () => {
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'SANIDAD', meaning: 'product' },
      { header: 'SANIDAD 2', meaning: 'product' },
    ]
    expect(validateColumnMapping(mapping, 'health')).toBeNull()
  })
})

describe('applyColumnMapping', () => {
  const headers = ['IDE', 'Fecha', 'CATEGORIA', 'SEXO', 'PROPIETARIO']
  const mapping: ColumnMapping = [
    { header: 'IDE', meaning: 'tag' },
    { header: 'Fecha', meaning: 'date' },
    { header: 'CATEGORIA', meaning: 'category' },
    { header: 'SEXO', meaning: 'sex' },
    { header: 'PROPIETARIO', meaning: 'owner' },
  ]

  test('maps every meaning onto its row', () => {
    const rows = [['123', '2026-01-15', 'Ternero', 'M', 'Juan Perez']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result).toEqual([
      { tag: '123', category: 'Ternero', sex: 'M', owner: 'Juan Perez', date: '2026-01-15' },
    ])
  })

  test('normalizes long-form sex values', () => {
    const rows = [['123', '', '', 'Hembra', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result[0].sex).toEqual('H')
  })

  test('leaves sex undefined for an unrecognized value instead of blocking', () => {
    const rows = [['123', '', '', 'unknown', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result[0].sex).toBeUndefined()
  })

  test('skips rows with no tag value', () => {
    const rows = [['', '', '', '', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result).toEqual([])
  })

  test('leaves date undefined when the mapped cell is empty or unparseable', () => {
    const rows = [['123', 'not a date', '', '', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result[0].date).toBeUndefined()
  })
})

describe('extractProductSuggestions', () => {
  test('takes the first non-empty value from each product-mapped column', () => {
    const headers = ['IDE', 'SANIDAD', 'SANIDAD 2']
    const rows = [
      ['123', 'ASPERSIN', 'AFTOSA'],
      ['456', 'ASPERSIN', 'AFTOSA'],
    ]
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'SANIDAD', meaning: 'product' },
      { header: 'SANIDAD 2', meaning: 'product' },
    ]
    expect(extractProductSuggestions(headers, rows, mapping)).toEqual(['ASPERSIN', 'AFTOSA'])
  })

  test('returns an empty array when no column is mapped as product', () => {
    const headers = ['IDE']
    const rows = [['123']]
    const mapping: ColumnMapping = [{ header: 'IDE', meaning: 'tag' }]
    expect(extractProductSuggestions(headers, rows, mapping)).toEqual([])
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
cd web
npm run test
```

Expected: FAIL — `Cannot find module '@/lib/activities/parse-raw-excel'` and `'@/lib/activities/column-mapping'`.

- [ ] **Step 4: Implement (GREEN)**

Create `web/lib/activities/parse-raw-excel.ts`:

```ts
import ExcelJS from 'exceljs'
import type { RawExcelResult } from './types'

export async function parseRawExcel(buffer: ArrayBuffer): Promise<RawExcelResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    return { ok: false, error: 'El archivo no tiene ninguna hoja.' }
  }

  const columnCount = worksheet.columnCount
  const headerRow = worksheet.getRow(1)
  const headers: string[] = []
  for (let col = 1; col <= columnCount; col++) {
    headers.push(String(headerRow.getCell(col).value ?? '').trim())
  }
  if (headers.every((h) => h === '')) {
    return { ok: false, error: 'El Excel no tiene encabezados.' }
  }

  const rows: string[][] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values: string[] = []
    for (let col = 1; col <= columnCount; col++) {
      values.push(String(row.getCell(col).value ?? '').trim())
    }
    if (values.every((v) => v === '')) return
    rows.push(values)
  })

  return { ok: true, headers, rows }
}
```

Create `web/lib/activities/column-mapping.ts`:

```ts
import type { ActivityType, ColumnMapping, ColumnMeaning, MappedRow } from './types'

export function computeHeaderSignature(headers: string[]): string {
  return JSON.stringify(headers.map((h) => h.trim()))
}

export function validateColumnMapping(mapping: ColumnMapping, activityType: ActivityType): string | null {
  const meanings = mapping.map((m) => m.meaning)

  if (meanings.filter((m) => m === 'tag').length !== 1) {
    return 'Tenés que asignar exactamente una columna como "Caravana".'
  }
  if (meanings.filter((m) => m === 'date').length > 1) {
    return 'Solo podés asignar una columna como "Fecha".'
  }
  if (meanings.filter((m) => m === 'category').length > 1) {
    return 'Solo podés asignar una columna como "Categoría".'
  }
  if (meanings.filter((m) => m === 'sex').length > 1) {
    return 'Solo podés asignar una columna como "Sexo".'
  }
  if (meanings.filter((m) => m === 'owner').length > 1) {
    return 'Solo podés asignar una columna como "Propietario".'
  }
  if (activityType === 'transfer' && meanings.some((m) => m === 'product')) {
    return 'La columna "Producto" solo se puede usar en sanidad.'
  }

  return null
}

function columnIndexesByMeaning(mapping: ColumnMapping, meaning: ColumnMeaning): number[] {
  return mapping.reduce<number[]>((indexes, entry, i) => {
    if (entry.meaning === meaning) indexes.push(i)
    return indexes
  }, [])
}

function normalizeSex(raw: string): 'M' | 'H' | undefined {
  const value = raw.trim().toUpperCase()
  if (value === 'M' || value === 'MACHO') return 'M'
  if (value === 'H' || value === 'HEMBRA') return 'H'
  return undefined
}

function normalizeDate(raw: string): string | undefined {
  if (!raw.trim()) return undefined
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString().slice(0, 10)
}

export function applyColumnMapping(headers: string[], rows: string[][], mapping: ColumnMapping): MappedRow[] {
  const tagIndex = columnIndexesByMeaning(mapping, 'tag')[0]
  const dateIndex = columnIndexesByMeaning(mapping, 'date')[0]
  const categoryIndex = columnIndexesByMeaning(mapping, 'category')[0]
  const sexIndex = columnIndexesByMeaning(mapping, 'sex')[0]
  const ownerIndex = columnIndexesByMeaning(mapping, 'owner')[0]

  return rows
    .map((row): MappedRow | null => {
      const tag = row[tagIndex]?.trim() ?? ''
      if (!tag) return null

      return {
        tag,
        category: categoryIndex !== undefined ? row[categoryIndex]?.trim() || undefined : undefined,
        sex: sexIndex !== undefined ? normalizeSex(row[sexIndex] ?? '') : undefined,
        owner: ownerIndex !== undefined ? row[ownerIndex]?.trim() || undefined : undefined,
        date: dateIndex !== undefined ? normalizeDate(row[dateIndex] ?? '') : undefined,
      }
    })
    .filter((row): row is MappedRow => row !== null)
}

export function extractProductSuggestions(headers: string[], rows: string[][], mapping: ColumnMapping): string[] {
  const productIndexes = columnIndexesByMeaning(mapping, 'product')
  const suggestions: string[] = []
  for (const index of productIndexes) {
    const firstValue = rows.map((row) => row[index]?.trim()).find((value) => !!value)
    if (firstValue) suggestions.push(firstValue)
  }
  return suggestions
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npm run test
```

Expected: PASS — all tests in `parse-raw-excel.test.ts` and `column-mapping.test.ts` green.

- [ ] **Step 6: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web
git commit -m "feat: replace fixed-column Excel detection with generic raw parsing + mapping logic"
```

---

## Task 4: `resolveBatchRows` rewrite (owner/sex resolution, per-row event date)

**Files:**
- Modify: `web/lib/activities/resolve-batch-rows.ts`
- Create: `web/__tests__/resolve-batch-rows.test.ts`

**Interfaces:**
- Consumes: `MappedRow`, `PreviewRow` (Task 3), `public.animal_current_state`, `public.category`, `public.owner` (existing/Task 1).
- Produces: `resolveBatchRows(supabase: SupabaseClient, rows: MappedRow[], defaultEventDate: string): Promise<PreviewRow[]>`.

- [ ] **Step 1: Write the failing test (RED)**

Create `web/__tests__/resolve-batch-rows.test.ts`:

```ts
import { describe, test, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBatchRows } from '@/lib/activities/resolve-batch-rows'
import type { MappedRow } from '@/lib/activities/types'

type QueryResult = { data: unknown[] | null; error: unknown }

function buildSupabaseMock(opts: {
  animals?: QueryResult
  categories?: QueryResult
  owners?: QueryResult
}) {
  const animalsResult: QueryResult = opts.animals ?? { data: [], error: null }
  const categoriesResult: QueryResult = opts.categories ?? { data: [], error: null }
  const ownersResult: QueryResult = opts.owners ?? { data: [], error: null }

  const from = vi.fn((table: string) => {
    const result = table === 'animal_current_state' ? animalsResult : table === 'category' ? categoriesResult : ownersResult
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve(result)),
      })),
    }
  })

  return { from } as unknown as SupabaseClient
}

describe('resolveBatchRows', () => {
  test('a brand-new tag with no category/sex/owner resolves as new with nulls', async () => {
    const rows: MappedRow[] = [{ tag: '123' }]
    const supabase = buildSupabaseMock({})

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([
      { tag: '123', kind: 'new', categoryId: null, ownerId: null, sex: null, eventDate: '2026-01-01' },
    ])
  })

  test('an existing alive animal resolves as existing, using the row date when mapped', async () => {
    const rows: MappedRow[] = [{ tag: '123', date: '2026-02-02' }]
    const supabase = buildSupabaseMock({
      animals: { data: [{ animal_id: 'animal-1', current_tag: '123', status: 'alive' }], error: null },
    })

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([{ tag: '123', kind: 'existing', animalId: 'animal-1', eventDate: '2026-02-02' }])
  })

  test('a sold/dead existing animal is a row error', async () => {
    const rows: MappedRow[] = [{ tag: '123' }]
    const supabase = buildSupabaseMock({
      animals: { data: [{ animal_id: 'animal-1', current_tag: '123', status: 'sold' }], error: null },
    })

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([{ tag: '123', kind: 'error', reason: 'Animal vendido o muerto' }])
  })

  test('a category name that matches the catalog resolves to its id for a new animal', async () => {
    const rows: MappedRow[] = [{ tag: '123', category: 'Ternero' }]
    const supabase = buildSupabaseMock({
      categories: { data: [{ id: 'cat-1', name: 'Ternero' }], error: null },
    })

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([
      { tag: '123', kind: 'new', categoryId: 'cat-1', ownerId: null, sex: null, eventDate: '2026-01-01' },
    ])
  })

  test('a category name with no catalog match is a row error', async () => {
    const rows: MappedRow[] = [{ tag: '123', category: 'Inexistente' }]
    const supabase = buildSupabaseMock({})

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([{ tag: '123', kind: 'error', reason: 'Categoría "Inexistente" no existe' }])
  })

  test('an owner name that matches the catalog resolves to its id for a new animal', async () => {
    const rows: MappedRow[] = [{ tag: '123', owner: 'Juan Perez' }]
    const supabase = buildSupabaseMock({
      owners: { data: [{ id: 'owner-1', name: 'Juan Perez' }], error: null },
    })

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([
      { tag: '123', kind: 'new', categoryId: null, ownerId: 'owner-1', sex: null, eventDate: '2026-01-01' },
    ])
  })

  test('an owner name with no catalog match is a row error, same as an unmatched category', async () => {
    const rows: MappedRow[] = [{ tag: '123', owner: 'Desconocido' }]
    const supabase = buildSupabaseMock({})

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([{ tag: '123', kind: 'error', reason: 'Propietario "Desconocido" no existe' }])
  })

  test('sex passes through directly onto a new animal', async () => {
    const rows: MappedRow[] = [{ tag: '123', sex: 'H' }]
    const supabase = buildSupabaseMock({})

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([
      { tag: '123', kind: 'new', categoryId: null, ownerId: null, sex: 'H', eventDate: '2026-01-01' },
    ])
  })

  test('a duplicate tag across rows is a row error, independent of any mapped attribute', async () => {
    const rows: MappedRow[] = [{ tag: '123' }, { tag: '123' }]
    const supabase = buildSupabaseMock({})

    const result = await resolveBatchRows(supabase, rows, '2026-01-01')

    expect(result).toEqual([
      { tag: '123', kind: 'error', reason: 'Caravana duplicada en el Excel' },
      { tag: '123', kind: 'error', reason: 'Caravana duplicada en el Excel' },
    ])
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd web
npm run test
```

Expected: FAIL — `resolveBatchRows` doesn't accept a third argument yet, and several assertions on `ownerId`/`sex`/`eventDate` fail against the old return shape.

- [ ] **Step 3: Implement (GREEN)**

Replace `web/lib/activities/resolve-batch-rows.ts` entirely with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MappedRow, PreviewRow } from './types'

export async function resolveBatchRows(
  supabase: SupabaseClient,
  rows: MappedRow[],
  defaultEventDate: string
): Promise<PreviewRow[]> {
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

  const ownerNames = [...new Set(rows.map((row) => row.owner).filter((o): o is string => !!o))]
  const { data: owners, error: ownersError } = await supabase.from('owner').select('id, name').in('name', ownerNames)
  if (ownersError) throw ownersError

  const animalByTag = new Map(existingAnimals?.map((a) => [a.current_tag, a]) ?? [])
  const categoryIdByName = new Map(categories?.map((c) => [c.name, c.id]) ?? [])
  const ownerIdByName = new Map(owners?.map((o) => [o.name, o.id]) ?? [])

  return rows.map((row): PreviewRow => {
    const eventDate = row.date ?? defaultEventDate

    if (duplicateTags.has(row.tag)) {
      return { tag: row.tag, kind: 'error', reason: 'Caravana duplicada en el Excel' }
    }

    const existing = animalByTag.get(row.tag)
    if (existing) {
      if (existing.status !== 'alive') {
        return { tag: row.tag, kind: 'error', reason: 'Animal vendido o muerto' }
      }
      return { tag: row.tag, kind: 'existing', animalId: existing.animal_id, eventDate }
    }

    let categoryId: string | null = null
    if (row.category) {
      const id = categoryIdByName.get(row.category)
      if (!id) return { tag: row.tag, kind: 'error', reason: `Categoría "${row.category}" no existe` }
      categoryId = id
    }

    let ownerId: string | null = null
    if (row.owner) {
      const id = ownerIdByName.get(row.owner)
      if (!id) return { tag: row.tag, kind: 'error', reason: `Propietario "${row.owner}" no existe` }
      ownerId = id
    }

    return {
      tag: row.tag,
      kind: 'new',
      categoryId,
      ownerId,
      sex: row.sex === 'M' || row.sex === 'H' ? row.sex : null,
      eventDate,
    }
  })
}
```

Note: `web/lib/activities/reverify-batch-rows.ts` needs **no changes** — it only ever reads `row.tag`, `row.kind`, and `row.animalId`, all of which are unchanged on `PreviewRow`.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test
```

Expected: PASS — all tests in `resolve-batch-rows.test.ts` green, and `reverify-batch-rows.test.ts` still green unmodified.

- [ ] **Step 5: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web
git commit -m "feat: resolve owner/sex and per-row event date in resolveBatchRows"
```

---

## Task 5: `confirm_transfer_batch` — per-row event date, sex/owner_id on new animals

**Files:**
- Create: `supabase/migrations/20260720162201_update_confirm_transfer_batch.sql`
- Modify: `supabase/tests/11_confirm_transfer_batch.sql`

**Interfaces:**
- Produces: `public.confirm_transfer_batch(p_farm_id uuid, p_destination_farm_id uuid, p_destination_paddock_id uuid, p_existing_animals jsonb, p_new_animals jsonb) returns uuid` — `p_existing_animals` is `[{"animal_id": uuid, "event_date": date}]`; `p_new_animals` is `[{"tag": string, "category_id": uuid|null, "owner_id": uuid|null, "sex": "M"|"H"|null, "event_date": date}]`. Replaces the old `(p_farm_id, p_destination_farm_id, p_destination_paddock_id, p_event_date, p_existing_animal_ids uuid[], p_new_animals jsonb)` signature entirely — this is a breaking change, not an overload.

- [ ] **Step 1: Update the test to the new signature (RED)**

Replace `supabase/tests/11_confirm_transfer_batch.sql` entirely with:

```sql
begin;
select plan(9);

select has_function('public', 'confirm_transfer_batch', 'confirm_transfer_batch function exists');

insert into public.farm (id, name) values
  ('d1111111-1111-1111-1111-111111111111', 'Campo Norte'),
  ('d2222222-2222-2222-2222-222222222222', 'Campo Sur');
insert into public.paddock (id, farm_id, name) values
  ('d3333333-3333-3333-3333-333333333333', 'd1111111-1111-1111-1111-111111111111', 'Potrero 1'),
  ('d4444444-4444-4444-4444-444444444444', 'd1111111-1111-1111-1111-111111111111', 'Potrero 2'),
  ('d9999999-9999-9999-9999-999999999999', 'd2222222-2222-2222-2222-222222222222', 'Potrero Sur');
insert into public.category (id, name) values ('d5555555-5555-5555-5555-555555555555', 'Ternero');
insert into public.owner (id, name) values ('d0000000-0000-0000-0000-000000000000', 'Estancia La Postrera');

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

-- Move the existing animal to Potrero 2 (with its own event date), and
-- register one brand-new animal with category/sex/owner and a *different*
-- per-row event date, into the same paddock.
select lives_ok(
  $$ select public.confirm_transfer_batch(
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd4444444-4444-4444-4444-444444444444'::uuid,
       '[{"animal_id": "d6666666-6666-6666-6666-666666666666", "event_date": "2026-01-02"}]'::jsonb,
       '[{"tag": "999", "category_id": "d5555555-5555-5555-5555-555555555555", "owner_id": "d0000000-0000-0000-0000-000000000000", "sex": "H", "event_date": "2026-01-03"}]'::jsonb
     ) $$,
  'confirm_transfer_batch runs without error for an existing + a new animal'
);

select is(
  (select current_paddock_id from public.animal_current_state where animal_id = 'd6666666-6666-6666-6666-666666666666'),
  'd4444444-4444-4444-4444-444444444444'::uuid,
  'the existing animal now shows Potrero 2 as its current paddock'
);

select is(
  (select acs.current_category_id from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '999'),
  'd5555555-5555-5555-5555-555555555555'::uuid,
  'the new animal has the category from the Excel row, via a self-recategorize event'
);

select is(
  (select acs.sex from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '999'),
  'H',
  'the new animal has sex set directly on the animal row, not via an event'
);

select is(
  (select acs.owner_id from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '999'),
  'd0000000-0000-0000-0000-000000000000'::uuid,
  'the new animal has owner_id set directly on the animal row, not via an event'
);

select is(
  (select event_date from public.event where animal_id = 'd6666666-6666-6666-6666-666666666666' and event_type = 'transfer' order by created_at desc limit 1),
  '2026-01-02'::date,
  'the existing animal used its own per-row event_date'
);

select is(
  (select event_date from public.event e
   join public.animal_tag_history h on h.animal_id = e.animal_id
   where h.tag = '999' and e.event_type = 'retag'),
  '2026-01-03'::date,
  'the new animal used its own, different per-row event_date'
);

select tests.clear_authentication();
select tests.authenticate_as('confirm_transfer_admin');

select throws_like(
  $$ select public.confirm_transfer_batch(
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd1111111-1111-1111-1111-111111111111'::uuid,
       'd9999999-9999-9999-9999-999999999999'::uuid,
       '[]'::jsonb,
       '[{"tag": "888", "category_id": null, "owner_id": null, "sex": null, "event_date": "2026-01-01"}]'::jsonb
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
cd /Users/salvadorpanissa/Documents/traceability
supabase test db
```

Expected: FAIL — the old `confirm_transfer_batch(uuid, uuid, uuid, date, uuid[], jsonb)` doesn't match this call shape (function overload resolution error).

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new update_confirm_transfer_batch
```

Rename the generated file to `supabase/migrations/20260720162201_update_confirm_transfer_batch.sql` and replace its contents with:

```sql
-- Breaking signature change (not an overload): p_event_date/p_existing_animal_ids
-- are replaced by JSON arrays carrying a per-row event_date, and p_new_animals
-- rows now also carry owner_id/sex for the fixed, non-versioned animal
-- attributes added in 20260720160512_create_owner_and_animal_attributes.sql.
drop function if exists public.confirm_transfer_batch(uuid, uuid, uuid, date, uuid[], jsonb);

create function public.confirm_transfer_batch(
  p_farm_id uuid,
  p_destination_farm_id uuid,
  p_destination_paddock_id uuid,
  p_existing_animals jsonb,
  p_new_animals jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_batch_id uuid;
  v_animal_count int;
  v_row jsonb;
  v_animal_id uuid;
  v_event_date date;
  v_origin_farm_id uuid;
  v_origin_paddock_id uuid;
  v_event_id uuid;
begin
  if p_destination_paddock_id is not null then
    if not exists (
      select 1 from public.paddock
      where id = p_destination_paddock_id and farm_id = p_destination_farm_id
    ) then
      raise exception 'El potrero destino no pertenece al establecimiento destino.';
    end if;
  end if;

  v_animal_count := jsonb_array_length(p_existing_animals) + jsonb_array_length(p_new_animals);

  insert into public.batch_operation (event_type, farm_id, animal_count, created_by)
  values ('transfer', p_farm_id, v_animal_count, auth.uid())
  returning id into v_batch_id;

  -- Existing animals: origin is looked up server-side from their real
  -- current placement, never trusted from the client. event_date now comes
  -- per-row from the client (mapped "Fecha" column, or the form's default).
  for v_row in select * from jsonb_array_elements(p_existing_animals)
  loop
    v_animal_id := (v_row->>'animal_id')::uuid;
    v_event_date := (v_row->>'event_date')::date;

    select current_farm_id, current_paddock_id into v_origin_farm_id, v_origin_paddock_id
    from public.animal_current_state
    where animal_id = v_animal_id;

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;

    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, origin_paddock_id, destination_paddock_id)
    values (v_event_id, v_origin_farm_id, p_destination_farm_id, v_origin_paddock_id, p_destination_paddock_id);
  end loop;

  -- New animals: create the animal (with its fixed sex/owner_id set directly,
  -- no event involved), then a self-retag, the real transfer to the
  -- destination, and an optional self-recategorize.
  --
  -- The id is generated here and inserted explicitly (no RETURNING):
  -- Postgres re-checks INSERT ... RETURNING output against the table's
  -- SELECT policy, and animal_select requires an existing
  -- animal_current_state row scoped to the caller's farm — which a
  -- brand-new animal doesn't have until its transfer event below commits
  -- and the derived-state view refreshes. RETURNING would therefore raise
  -- "new row violates row-level security policy" even though the INSERT's
  -- own WITH CHECK passes.
  for v_row in select * from jsonb_array_elements(p_new_animals)
  loop
    v_animal_id := gen_random_uuid();
    v_event_date := (v_row->>'event_date')::date;

    insert into public.animal (id, sex, owner_id)
    values (v_animal_id, v_row->>'sex', (v_row->>'owner_id')::uuid);
    insert into public.animal_tag_history (animal_id, tag) values (v_animal_id, v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('retag', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_retag (event_id, old_tag, new_tag)
    values (v_event_id, v_row->>'tag', v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, destination_paddock_id)
    values (v_event_id, p_farm_id, p_destination_farm_id, p_destination_paddock_id);

    if (v_row->>'category_id') is not null then
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('recategorize', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_recategorize (event_id, old_category_id, new_category_id)
      values (v_event_id, (v_row->>'category_id')::uuid, (v_row->>'category_id')::uuid);
    end if;
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function public.confirm_transfer_batch(uuid, uuid, uuid, jsonb, jsonb) to authenticated;
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
supabase test db
```

Expected: PASS — `1..9`, all ok, and all prior test files still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: give confirm_transfer_batch per-row event dates and new-animal sex/owner"
```

---

## Task 6: `confirm_health_batch` — multi-product, per-row event date, sex/owner_id

**Files:**
- Create: `supabase/migrations/20260720163348_update_confirm_health_batch.sql`
- Modify: `supabase/tests/12_confirm_health_batch.sql`

**Interfaces:**
- Produces: `public.confirm_health_batch(p_farm_id uuid, p_products jsonb, p_existing_animals jsonb, p_new_animals jsonb) returns uuid` — `p_products` is `[{"product_id": uuid, "dose": numeric, "dose_unit": text, "route": text, "withdrawal_days": int|null}]`, applied to **every** animal in the batch (one `event`+`event_health` row per animal per product). `p_existing_animals`/`p_new_animals` shaped identically to Task 5. Replaces the old `(p_farm_id, p_product_id, p_dose, p_dose_unit, p_route, p_withdrawal_days, p_event_date, p_existing_animal_ids uuid[], p_new_animals jsonb)` signature entirely.

- [ ] **Step 1: Update the test to the new signature (RED)**

Replace `supabase/tests/12_confirm_health_batch.sql` entirely with:

```sql
begin;
select plan(8);

select has_function('public', 'confirm_health_batch', 'confirm_health_batch function exists');

insert into public.farm (id, name) values ('e1111111-1111-1111-1111-111111111111', 'Campo Norte');
insert into public.product (id, name, default_dose_unit, default_withdrawal_days) values
  ('e2222222-2222-2222-2222-222222222222', 'Ivermectina 1%', 'ml', 21),
  ('e7777777-7777-7777-7777-777777777777', 'Aftosa', 'ml', 60);
insert into public.category (id, name) values ('e3333333-3333-3333-3333-333333333333', 'Vaca');
insert into public.owner (id, name) values ('e8888888-8888-8888-8888-888888888888', 'Estancia La Postrera');

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

-- Two products applied to one existing + one new animal (with category,
-- sex, owner, and its own event_date).
select lives_ok(
  $$ select public.confirm_health_batch(
       'e1111111-1111-1111-1111-111111111111'::uuid,
       '[{"product_id": "e2222222-2222-2222-2222-222222222222", "dose": 10, "dose_unit": "ml", "route": "subcutánea", "withdrawal_days": 21},
         {"product_id": "e7777777-7777-7777-7777-777777777777", "dose": 5, "dose_unit": "ml", "route": "intramuscular", "withdrawal_days": 60}]'::jsonb,
       '[{"animal_id": "e4444444-4444-4444-4444-444444444444", "event_date": "2026-01-02"}]'::jsonb,
       '[{"tag": "777", "category_id": "e3333333-3333-3333-3333-333333333333", "owner_id": "e8888888-8888-8888-8888-888888888888", "sex": "M", "event_date": "2026-01-03"}]'::jsonb
     ) $$,
  'confirm_health_batch runs without error for an existing + a new animal, with two products'
);

select is(
  (select count(*) from public.event_health)::int, 4,
  'both animals got one event_health row per product (2 animals x 2 products)'
);

select is(
  (select count(*) from public.event_health where product_id = 'e7777777-7777-7777-7777-777777777777' and dose = 5)::int, 2,
  'the second product was applied to both animals with its own dose'
);

select is(
  (select current_farm_id from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '777'),
  'e1111111-1111-1111-1111-111111111111'::uuid,
  'the new animal is placed in the operating farm via the internal self-transfer'
);

select is(
  (select sex from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '777'),
  'M',
  'the new animal has sex set directly on the animal row'
);

select is(
  (select owner_id from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '777'),
  'e8888888-8888-8888-8888-888888888888'::uuid,
  'the new animal has owner_id set directly on the animal row'
);

select is(
  (select event_date from public.event where animal_id = 'e4444444-4444-4444-4444-444444444444' and event_type = 'health' limit 1),
  '2026-01-02'::date,
  'the existing animal used its own per-row event_date'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase test db
```

Expected: FAIL — the old `confirm_health_batch(uuid, uuid, numeric, text, text, int, date, uuid[], jsonb)` doesn't match this call shape.

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new update_confirm_health_batch
```

Rename the generated file to `supabase/migrations/20260720163348_update_confirm_health_batch.sql` and replace its contents with:

```sql
-- Breaking signature change: the single p_product_id/p_dose/p_dose_unit/
-- p_route/p_withdrawal_days/p_event_date parameters are replaced by
-- p_products (one entry per product to apply to every animal in the lote,
-- per the spec's multi-product sanidad) plus per-row event dates and
-- new-animal owner_id/sex, mirroring Task 5's confirm_transfer_batch change.
drop function if exists public.confirm_health_batch(uuid, uuid, numeric, text, text, int, date, uuid[], jsonb);

create function public.confirm_health_batch(
  p_farm_id uuid,
  p_products jsonb,
  p_existing_animals jsonb,
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
  v_event_date date;
  v_row jsonb;
  v_product jsonb;
begin
  v_animal_count := jsonb_array_length(p_existing_animals) + jsonb_array_length(p_new_animals);

  insert into public.batch_operation (event_type, farm_id, animal_count, created_by)
  values ('health', p_farm_id, v_animal_count, auth.uid())
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(p_existing_animals)
  loop
    v_animal_id := (v_row->>'animal_id')::uuid;
    v_event_date := (v_row->>'event_date')::date;

    for v_product in select * from jsonb_array_elements(p_products)
    loop
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('health', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_health (event_id, product_id, dose, dose_unit, route, withdrawal_days)
      values (
        v_event_id,
        (v_product->>'product_id')::uuid,
        (v_product->>'dose')::numeric,
        v_product->>'dose_unit',
        v_product->>'route',
        (v_product->>'withdrawal_days')::int
      );
    end loop;
  end loop;

  -- Same RETURNING/RLS pitfall as confirm_transfer_batch (Task 5): generate
  -- the id explicitly and insert without RETURNING, since animal_select
  -- can't yet see a row with zero events.
  for v_row in select * from jsonb_array_elements(p_new_animals)
  loop
    v_animal_id := gen_random_uuid();
    v_event_date := (v_row->>'event_date')::date;

    insert into public.animal (id, sex, owner_id)
    values (v_animal_id, v_row->>'sex', (v_row->>'owner_id')::uuid);
    insert into public.animal_tag_history (animal_id, tag) values (v_animal_id, v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('retag', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_retag (event_id, old_tag, new_tag)
    values (v_event_id, v_row->>'tag', v_row->>'tag');

    -- Internal self-transfer: places the new animal in the operating farm.
    -- Not a real traslado the user chose, and never carries a paddock.
    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id)
    values (v_event_id, p_farm_id, p_farm_id);

    if (v_row->>'category_id') is not null then
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('recategorize', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_recategorize (event_id, old_category_id, new_category_id)
      values (v_event_id, (v_row->>'category_id')::uuid, (v_row->>'category_id')::uuid);
    end if;

    for v_product in select * from jsonb_array_elements(p_products)
    loop
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('health', v_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_health (event_id, product_id, dose, dose_unit, route, withdrawal_days)
      values (
        v_event_id,
        (v_product->>'product_id')::uuid,
        (v_product->>'dose')::numeric,
        v_product->>'dose_unit',
        v_product->>'route',
        (v_product->>'withdrawal_days')::int
      );
    end loop;
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function public.confirm_health_batch(uuid, jsonb, jsonb, jsonb) to authenticated;
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
supabase test db
```

Expected: PASS — `1..8`, all ok, all prior test files still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: give confirm_health_batch multiple products, per-row dates, new-animal sex/owner"
```

---

## Task 7: Server Actions rewrite (mapping detection/save, updated validate/confirm)

**Files:**
- Modify: `web/app/(protected)/actividades/nueva/actions.ts`

**Interfaces:**
- Consumes: `parseRawExcel`, `computeHeaderSignature`, `validateColumnMapping`, `applyColumnMapping`, `extractProductSuggestions` (Task 3), `resolveBatchRows` (Task 4), `reverifyBatchRows` (existing, unchanged), `confirm_transfer_batch`/`confirm_health_batch` RPCs (Tasks 5–6).
- Produces:
  - `iniciarLote(formData: FormData): Promise<{ ok: true; headers: string[]; rows: string[][]; savedMapping: ColumnMapping | null } | { ok: false; error: string }>` — parses the raw Excel once and looks up any saved mapping for its header signature. Replaces `validarLoteTraslado`/`validarLoteSanidad`'s file-parsing half.
  - `validarLoteConMapeo(input: { headers: string[]; rows: string[][]; mapping: ColumnMapping; activityType: ActivityType; eventDate: string }): Promise<{ ok: true; rows: PreviewRow[]; productSuggestions: string[] } | { ok: false; error: string }>` — validates the mapping, saves (upserts) it, applies it, and resolves the rows. Used by both activities.
  - `confirmarLoteTraslado(input: { rows: PreviewRow[]; destinationFarmId: string; destinationPaddockId: string | null }): Promise<{ ok: true } | { ok: false; error: string }>` — signature unchanged from the caller's point of view; internals now build the new RPC's per-row shapes.
  - `confirmarLoteSanidad(input: { rows: PreviewRow[]; products: { productId: string; dose: number; doseUnit: string; route: string; withdrawalDays: number | null }[] }): Promise<{ ok: true } | { ok: false; error: string }>` — `products` replaces the old single `productId`/`dose`/`doseUnit`/`route`/`withdrawalDays` fields.

- [ ] **Step 1: Replace `actions.ts`**

Replace `web/app/(protected)/actividades/nueva/actions.ts` entirely with:

```ts
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { parseRawExcel } from '@/lib/activities/parse-raw-excel'
import { resolveBatchRows } from '@/lib/activities/resolve-batch-rows'
import { reverifyBatchRows } from '@/lib/activities/reverify-batch-rows'
import {
  applyColumnMapping,
  computeHeaderSignature,
  extractProductSuggestions,
  validateColumnMapping,
} from '@/lib/activities/column-mapping'
import type { ActivityType, ColumnMapping, PreviewRow } from '@/lib/activities/types'

export async function iniciarLote(
  formData: FormData
): Promise<
  | { ok: true; headers: string[]; rows: string[][]; savedMapping: ColumnMapping | null }
  | { ok: false; error: string }
> {
  const file = formData.get('excel') as File | null
  if (!file) return { ok: false, error: 'No se recibió ningún archivo.' }

  const parsed = await parseRawExcel(await file.arrayBuffer())
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const supabase = await createClient()
  const signature = computeHeaderSignature(parsed.headers)
  const { data, error } = await supabase
    .from('column_mapping')
    .select('mapping')
    .eq('header_signature', signature)
    .maybeSingle()

  if (error) return { ok: false, error: 'No pudimos leer el mapeo guardado. Intentá de nuevo en unos minutos.' }

  return {
    ok: true,
    headers: parsed.headers,
    rows: parsed.rows,
    savedMapping: (data?.mapping as ColumnMapping | undefined) ?? null,
  }
}

export async function validarLoteConMapeo(input: {
  headers: string[]
  rows: string[][]
  mapping: ColumnMapping
  activityType: ActivityType
  eventDate: string
}): Promise<{ ok: true; rows: PreviewRow[]; productSuggestions: string[] } | { ok: false; error: string }> {
  const mappingError = validateColumnMapping(input.mapping, input.activityType)
  if (mappingError) return { ok: false, error: mappingError }

  const supabase = await createClient()
  const signature = computeHeaderSignature(input.headers)
  const { error: saveError } = await supabase
    .from('column_mapping')
    .upsert({ header_signature: signature, mapping: input.mapping }, { onConflict: 'header_signature' })
  if (saveError) return { ok: false, error: 'No pudimos guardar el mapeo de columnas.' }

  const mappedRows = applyColumnMapping(input.headers, input.rows, input.mapping)
  const productSuggestions =
    input.activityType === 'health' ? extractProductSuggestions(input.headers, input.rows, input.mapping) : []

  try {
    const rows = await resolveBatchRows(supabase, mappedRows, input.eventDate)
    return { ok: true, rows, productSuggestions }
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

  const reverifyError = await reverifyBatchRows(supabase, input.rows)
  if (reverifyError) return { ok: false, error: reverifyError }

  const existingAnimals = input.rows
    .filter((r) => r.kind === 'existing')
    .map((r) => ({ animal_id: r.animalId, event_date: r.eventDate }))
  const newAnimals = input.rows
    .filter((r) => r.kind === 'new')
    .map((r) => ({
      tag: r.tag,
      category_id: r.categoryId,
      owner_id: r.ownerId,
      sex: r.sex,
      event_date: r.eventDate,
    }))

  const { error } = await supabase.rpc('confirm_transfer_batch', {
    p_farm_id: operatingFarmId,
    p_destination_farm_id: input.destinationFarmId,
    p_destination_paddock_id: input.destinationPaddockId,
    p_existing_animals: existingAnimals,
    p_new_animals: newAnimals,
  })

  if (error) return { ok: false, error: 'No se pudo confirmar el lote. Intentá de nuevo en unos minutos.' }
  return { ok: true }
}

export async function confirmarLoteSanidad(input: {
  rows: PreviewRow[]
  products: { productId: string; dose: number; doseUnit: string; route: string; withdrawalDays: number | null }[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const operatingFarmId = cookieStore.get('active_farm_id')?.value
  if (!operatingFarmId) return { ok: false, error: 'No se pudo determinar el campo activo.' }

  const reverifyError = await reverifyBatchRows(supabase, input.rows)
  if (reverifyError) return { ok: false, error: reverifyError }

  const existingAnimals = input.rows
    .filter((r) => r.kind === 'existing')
    .map((r) => ({ animal_id: r.animalId, event_date: r.eventDate }))
  const newAnimals = input.rows
    .filter((r) => r.kind === 'new')
    .map((r) => ({
      tag: r.tag,
      category_id: r.categoryId,
      owner_id: r.ownerId,
      sex: r.sex,
      event_date: r.eventDate,
    }))
  const products = input.products.map((p) => ({
    product_id: p.productId,
    dose: p.dose,
    dose_unit: p.doseUnit,
    route: p.route,
    withdrawal_days: p.withdrawalDays,
  }))

  const { error } = await supabase.rpc('confirm_health_batch', {
    p_farm_id: operatingFarmId,
    p_products: products,
    p_existing_animals: existingAnimals,
    p_new_animals: newAnimals,
  })

  if (error) return { ok: false, error: 'No se pudo confirmar el lote. Intentá de nuevo en unos minutos.' }
  return { ok: true }
}
```

- [ ] **Step 2: Type-check**

```bash
cd web
npx tsc --noEmit
```

Expected: no new type errors from `actions.ts` (existing errors, if any, are unrelated pre-existing issues — none expected on a clean tree). `transfer-form.tsx`/`health-form.tsx` will show errors referencing the now-removed `validarLoteTraslado`/`validarLoteSanidad` — that's expected and resolved by Tasks 8–9.

- [ ] **Step 3: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web/app/\(protected\)/actividades/nueva/actions.ts
git commit -m "feat: rewrite activity Server Actions around column-mapping detection and multi-product sanidad"
```

---

## Task 8: Column-mapping UI + Traslado form wiring

**Files:**
- Create: `web/components/activities/column-mapping-form.tsx`
- Modify: `web/components/activities/transfer-form.tsx`
- Modify: `web/e2e/activity-transfer.spec.ts`

**Interfaces:**
- Consumes: `iniciarLote`, `validarLoteConMapeo`, `confirmarLoteTraslado` (Task 7), `validateColumnMapping` (Task 3), `getUserFarms`/`Farm` (existing).
- Produces: `ColumnMappingForm({ mapping: ColumnMapping; onChange: (mapping: ColumnMapping) => void; activityType: ActivityType })` — shared presentational component, reused by Task 9's `HealthForm`.

- [ ] **Step 1: Write the E2E test (RED)**

Replace `web/e2e/activity-transfer.spec.ts` entirely with:

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
  await page.getByLabel('Campo destino').click()
  await page.getByRole('option', { name: farmName }).click()
}

async function mapTagAndCategoryColumns(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Detectar columnas' }).click()
  await page.getByLabel('Significado de caravana').selectOption({ label: 'Caravana' })
  await page.getByLabel('Significado de categoria').selectOption({ label: 'Categoría' })
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
  await mapTagAndCategoryColumns(page)
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page.getByText('e2e-transfer-001')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})

test('clicking Confirmar a second time with the same stale preview rows fails re-verification instead of creating a duplicate tag', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await page.goto('/actividades/nueva')

  const excel = await buildExcelFile([{ tag: 'e2e-transfer-reconfirm', category: '' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await selectDestinationFarm(page, 'Campo Test Uno')
  await mapTagAndCategoryColumns(page)
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page.getByText('e2e-transfer-reconfirm')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/ya existe en el sistema/i)).toBeVisible()
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
  await mapTagAndCategoryColumns(page)
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page.getByText(/duplicada/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
})

test('a saved column mapping is reused automatically on a second upload with the same header signature', async ({ page }) => {
  await login(page, 'e2e.manager.one.farm@test.local')
  await page.goto('/actividades/nueva')

  const firstExcel = await buildExcelFile([{ tag: 'e2e-transfer-reuse-1' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: firstExcel,
  })
  await selectDestinationFarm(page, 'Campo Test Uno')
  await mapTagAndCategoryColumns(page)
  await page.getByRole('button', { name: 'Validar' }).click()
  await expect(page.getByText('e2e-transfer-reuse-1')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()

  await page.goto('/actividades/nueva')
  const secondExcel = await buildExcelFile([{ tag: 'e2e-transfer-reuse-2' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: secondExcel,
  })
  await selectDestinationFarm(page, 'Campo Test Uno')
  await page.getByRole('button', { name: 'Detectar columnas' }).click()
  await expect(page.getByLabel('Significado de caravana')).toHaveValue('tag')
  await expect(page.getByLabel('Significado de categoria')).toHaveValue('category')
  await page.getByRole('button', { name: 'Validar' }).click()
  await expect(page.getByText('e2e-transfer-reuse-2')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-transfer.spec.ts
```

Expected: FAIL — no "Detectar columnas" button exists yet (the page still renders the old single-step upload form).

- [ ] **Step 3: Implement the shared column-mapping component**

Create `web/components/activities/column-mapping-form.tsx`:

```tsx
'use client'

import { Label } from '@/components/ui/label'
import type { ActivityType, ColumnMapping, ColumnMeaning } from '@/lib/activities/types'

const MEANING_LABELS: Record<ColumnMeaning, string> = {
  tag: 'Caravana',
  date: 'Fecha',
  category: 'Categoría',
  sex: 'Sexo',
  owner: 'Propietario',
  product: 'Producto',
  ignore: 'Ignorar',
}

export function ColumnMappingForm({
  mapping,
  onChange,
  activityType,
}: {
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
  activityType: ActivityType
}) {
  const meaningOptions: ColumnMeaning[] =
    activityType === 'health'
      ? ['ignore', 'tag', 'date', 'category', 'sex', 'owner', 'product']
      : ['ignore', 'tag', 'date', 'category', 'sex', 'owner']

  const handleMeaningChange = (index: number, meaning: ColumnMeaning) => {
    onChange(mapping.map((entry, i) => (i === index ? { ...entry, meaning } : entry)))
  }

  return (
    <div className="grid gap-2">
      <Label>Mapeo de columnas</Label>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>Columna del Excel</th>
            <th>Significado</th>
          </tr>
        </thead>
        <tbody>
          {mapping.map((entry, index) => (
            <tr key={entry.header}>
              <td>{entry.header}</td>
              <td>
                <select
                  aria-label={`Significado de ${entry.header}`}
                  value={entry.meaning}
                  onChange={(e) => handleMeaningChange(index, e.target.value as ColumnMeaning)}
                  className="border rounded-md h-9 px-2"
                >
                  {meaningOptions.map((option) => (
                    <option key={option} value={option}>
                      {MEANING_LABELS[option]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite the transfer form**

Replace `web/components/activities/transfer-form.tsx` entirely with:

```tsx
'use client'

import { useState } from 'react'
import { iniciarLote, validarLoteConMapeo, confirmarLoteTraslado } from '@/app/(protected)/actividades/nueva/actions'
import { ColumnMappingForm } from '@/components/activities/column-mapping-form'
import { PreviewTable } from '@/components/activities/preview-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { validateColumnMapping } from '@/lib/activities/column-mapping'
import type { Farm } from '@/lib/farms'
import type { ColumnMapping, PreviewRow } from '@/lib/activities/types'

export function TransferForm({ farms, paddocksByFarm }: { farms: Farm[]; paddocksByFarm: Record<string, Farm[]> }) {
  const [file, setFile] = useState<File | null>(null)
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [destinationFarmId, setDestinationFarmId] = useState('')
  const [destinationPaddockId, setDestinationPaddockId] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[] | null>(null)
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>([])
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasErrors = rows?.some((r) => r.kind === 'error') ?? false
  const paddockOptions = destinationFarmId ? (paddocksByFarm[destinationFarmId] ?? []) : []
  const mappingError = headers ? validateColumnMapping(mapping, 'transfer') : 'Falta detectar las columnas.'

  const handleDetect = async () => {
    if (!file) return
    setMessage(null)
    setRows(null)
    const formData = new FormData()
    formData.set('excel', file)
    const result = await iniciarLote(formData)
    if (!result.ok) {
      setMessage(result.error)
      setHeaders(null)
      return
    }
    setHeaders(result.headers)
    setRawRows(result.rows)
    setMapping(
      result.headers.map((header) => ({
        header,
        meaning: result.savedMapping?.find((m) => m.header === header)?.meaning ?? 'ignore',
      }))
    )
  }

  const handleValidate = async () => {
    if (!headers || !rawRows) return
    setMessage(null)
    const result = await validarLoteConMapeo({ headers, rows: rawRows, mapping, activityType: 'transfer', eventDate })
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
        <Input id="excel" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="event-date">Fecha</Label>
        <Input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="destination-farm">Campo destino</Label>
        <Select
          value={destinationFarmId}
          onValueChange={(value) => {
            setDestinationFarmId(value ?? '')
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

      <Button type="button" onClick={handleDetect} disabled={!file || !destinationFarmId}>
        Detectar columnas
      </Button>

      {headers && (
        <>
          <ColumnMappingForm mapping={mapping} onChange={setMapping} activityType="transfer" />
          <Button type="button" onClick={handleValidate} disabled={!!mappingError}>
            Validar
          </Button>
        </>
      )}

      {rows && <PreviewTable rows={rows} />}
      {message && <p className="text-sm">{message}</p>}

      <Button type="button" onClick={handleConfirm} disabled={!rows || hasErrors}>
        Confirmar
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Run the E2E test and confirm it passes**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-transfer.spec.ts
```

Expected: PASS — all four tests green.

- [ ] **Step 6: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web
git commit -m "feat: add column-mapping UI step to the traslado activity form"
```

---

## Task 9: Multi-product sanidad form + mapping wiring

**Files:**
- Modify: `web/components/activities/health-form.tsx`
- Modify: `web/e2e/activity-health.spec.ts`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: `iniciarLote`, `validarLoteConMapeo`, `confirmarLoteSanidad` (Task 7), `ColumnMappingForm` (Task 8), `validateColumnMapping` (Task 3).
- Produces: nothing new beyond wiring — `HealthForm` now manages a list of product rows instead of one.

- [ ] **Step 1: Seed a second product for the multi-product E2E test**

Append to `supabase/seed.sql` (after the existing `Ivermectina 1%` insert):

```sql
insert into public.product (name, default_dose_unit, default_withdrawal_days)
values ('Aftosa', 'ml', 60)
on conflict (name) do nothing;

insert into public.owner (name) values ('Estancia La Postrera')
on conflict (name) do nothing;
```

- [ ] **Step 2: Write the E2E test (RED)**

Replace `web/e2e/activity-health.spec.ts` entirely with:

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

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e.manager.one.farm@test.local')
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('sanidad on a new tag creates the animal, places it, and prefills the product withdrawal period', async ({ page }) => {
  await login(page)
  await page.goto('/actividades/nueva')
  await page.getByLabel('Tipo de actividad').selectOption('Sanidad')

  const excel = await buildExcelFile([{ tag: 'e2e-health-001' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await page.getByRole('button', { name: 'Detectar columnas' }).click()
  await page.getByLabel('Significado de caravana').selectOption({ label: 'Caravana' })

  await page.getByRole('button', { name: '+ Agregar producto' }).click()
  await page.getByLabel('Producto').selectOption({ label: 'Ivermectina 1%' })
  await expect(page.getByLabel('Días de carencia')).toHaveValue('21')
  await page.getByLabel('Dosis', { exact: true }).fill('10')
  await page.getByLabel('Unidad de dosis').fill('ml')
  await page.getByLabel('Vía de administración').fill('subcutánea')

  await page.getByRole('button', { name: 'Validar' }).click()
  await expect(page.getByText('e2e-health-001')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})

test('adding two products applies one event_health per product to each animal in the batch', async ({ page }) => {
  await login(page)
  await page.goto('/actividades/nueva')
  await page.getByLabel('Tipo de actividad').selectOption('Sanidad')

  const excel = await buildExcelFile([{ tag: 'e2e-health-multi-001' }])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lote.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await page.getByRole('button', { name: 'Detectar columnas' }).click()
  await page.getByLabel('Significado de caravana').selectOption({ label: 'Caravana' })

  await page.getByRole('button', { name: '+ Agregar producto' }).click()
  await page.getByLabel('Producto').first().selectOption({ label: 'Ivermectina 1%' })
  await page.getByLabel('Dosis', { exact: true }).first().fill('10')
  await page.getByLabel('Unidad de dosis').first().fill('ml')
  await page.getByLabel('Vía de administración').first().fill('subcutánea')

  await page.getByRole('button', { name: '+ Agregar producto' }).click()
  await page.getByLabel('Producto').nth(1).selectOption({ label: 'Aftosa' })
  await page.getByLabel('Dosis', { exact: true }).nth(1).fill('5')
  await page.getByLabel('Unidad de dosis').nth(1).fill('ml')
  await page.getByLabel('Vía de administración').nth(1).fill('intramuscular')

  await page.getByRole('button', { name: 'Validar' }).click()
  await expect(page.getByText('e2e-health-multi-001')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-health.spec.ts
```

Expected: FAIL — no "Detectar columnas"/"+ Agregar producto" controls exist yet.

- [ ] **Step 4: Rewrite the health form**

Replace `web/components/activities/health-form.tsx` entirely with:

```tsx
'use client'

import { useState } from 'react'
import { iniciarLote, validarLoteConMapeo, confirmarLoteSanidad } from '@/app/(protected)/actividades/nueva/actions'
import { ColumnMappingForm } from '@/components/activities/column-mapping-form'
import { PreviewTable } from '@/components/activities/preview-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { validateColumnMapping } from '@/lib/activities/column-mapping'
import type { ColumnMapping, PreviewRow } from '@/lib/activities/types'

type Product = { id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }
type ProductRow = { productId: string; dose: string; doseUnit: string; route: string; withdrawalDays: string }

const emptyProductRow: ProductRow = { productId: '', dose: '', doseUnit: '', route: '', withdrawalDays: '' }

export function HealthForm({ products }: { products: Product[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [headers, setHeaders] = useState<string[] | null>(null)
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>([])
  const [productRows, setProductRows] = useState<ProductRow[]>([])
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasErrors = rows?.some((r) => r.kind === 'error') ?? false
  const mappingError = headers ? validateColumnMapping(mapping, 'health') : 'Falta detectar las columnas.'
  const hasValidProducts =
    productRows.length > 0 &&
    productRows.every((p) => p.productId && Number(p.dose) > 0 && p.doseUnit.trim() !== '' && p.route.trim() !== '')

  const updateProductRow = (index: number, patch: Partial<ProductRow>) => {
    setProductRows(productRows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId)
    updateProductRow(index, {
      productId,
      doseUnit: product?.defaultDoseUnit ?? '',
      withdrawalDays: product?.defaultWithdrawalDays?.toString() ?? '',
    })
  }

  const handleDetect = async () => {
    if (!file) return
    setMessage(null)
    setRows(null)
    const formData = new FormData()
    formData.set('excel', file)
    const result = await iniciarLote(formData)
    if (!result.ok) {
      setMessage(result.error)
      setHeaders(null)
      return
    }
    setHeaders(result.headers)
    setRawRows(result.rows)
    setMapping(
      result.headers.map((header) => ({
        header,
        meaning: result.savedMapping?.find((m) => m.header === header)?.meaning ?? 'ignore',
      }))
    )
  }

  const handleValidate = async () => {
    if (!headers || !rawRows) return
    setMessage(null)
    const result = await validarLoteConMapeo({ headers, rows: rawRows, mapping, activityType: 'health', eventDate })
    if (!result.ok) {
      setMessage(result.error)
      setRows(null)
      return
    }
    setRows(result.rows)

    if (productRows.length === 0 && result.productSuggestions.length > 0) {
      setProductRows(
        result.productSuggestions.map((suggestion) => {
          const match = products.find((p) => p.name.toLowerCase() === suggestion.toLowerCase())
          return match
            ? {
                productId: match.id,
                dose: '',
                doseUnit: match.defaultDoseUnit ?? '',
                route: '',
                withdrawalDays: match.defaultWithdrawalDays?.toString() ?? '',
              }
            : { ...emptyProductRow }
        })
      )
    }
  }

  const handleConfirm = async () => {
    if (!rows) return
    const result = await confirmarLoteSanidad({
      rows,
      products: productRows.map((p) => ({
        productId: p.productId,
        dose: Number(p.dose),
        doseUnit: p.doseUnit,
        route: p.route,
        withdrawalDays: p.withdrawalDays ? Number(p.withdrawalDays) : null,
      })),
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
        <Label htmlFor="event-date">Fecha</Label>
        <Input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>

      <Button type="button" onClick={handleDetect} disabled={!file}>
        Detectar columnas
      </Button>

      {headers && <ColumnMappingForm mapping={mapping} onChange={setMapping} activityType="health" />}

      <div className="flex flex-col gap-3">
        {productRows.map((row, index) => (
          <div key={index} className="grid gap-2 border rounded-md p-3">
            <Label htmlFor={`product-${index}`}>Producto</Label>
            <select
              id={`product-${index}`}
              aria-label="Producto"
              value={row.productId}
              onChange={(e) => handleProductChange(index, e.target.value)}
              className="border rounded-md h-9 px-2"
            >
              <option value="">Elegí un producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <Label htmlFor={`dose-${index}`}>Dosis</Label>
            <Input
              id={`dose-${index}`}
              aria-label="Dosis"
              type="number"
              value={row.dose}
              onChange={(e) => updateProductRow(index, { dose: e.target.value })}
            />

            <Label htmlFor={`dose-unit-${index}`}>Unidad de dosis</Label>
            <Input
              id={`dose-unit-${index}`}
              aria-label="Unidad de dosis"
              value={row.doseUnit}
              onChange={(e) => updateProductRow(index, { doseUnit: e.target.value })}
            />

            <Label htmlFor={`route-${index}`}>Vía de administración</Label>
            <Input
              id={`route-${index}`}
              aria-label="Vía de administración"
              value={row.route}
              onChange={(e) => updateProductRow(index, { route: e.target.value })}
            />

            <Label htmlFor={`withdrawal-days-${index}`}>Días de carencia</Label>
            <Input
              id={`withdrawal-days-${index}`}
              aria-label="Días de carencia"
              type="number"
              value={row.withdrawalDays}
              onChange={(e) => updateProductRow(index, { withdrawalDays: e.target.value })}
            />

            <Button type="button" variant="outline" onClick={() => setProductRows(productRows.filter((_, i) => i !== index))}>
              Quitar producto
            </Button>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={() => setProductRows([...productRows, { ...emptyProductRow }])}>
          + Agregar producto
        </Button>
      </div>

      <Button type="button" onClick={handleValidate} disabled={!!mappingError || !hasValidProducts}>
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

Note: multiple product rows share the same `aria-label` ("Producto", "Dosis", etc.) by design — Playwright's `getByLabel(...).first()`/`.nth(1)` (used in the E2E tests above) addresses them positionally, mirroring how the single-product form already worked before this task.

- [ ] **Step 5: Run the E2E test and confirm it passes**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-health.spec.ts
```

Expected: PASS — both tests green.

- [ ] **Step 6: Run the full suite and confirm no regression**

```bash
cd web
npm run test
npx playwright test
```

Expected: PASS — every Vitest and Playwright test green, including `activity-transfer.spec.ts` from Task 8.

- [ ] **Step 7: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web supabase/seed.sql
git commit -m "feat: support multiple products per sanidad batch, with mapping-based prefill"
```

---

## Task 10: Real-shaped reader export E2E + full regression

**Files:**
- Create: `web/e2e/activity-column-mapping.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–9. No new production code — this task is pure verification against the exact scenario that motivated the spec revision (a real electronic-tag-reader export with `IDE`/`IDV`/`Fecha`/`Hora`/`SEXO`/`SANIDAD`/`SANIDAD 2`/`PROPIETARIO`/`NOTA` columns).

- [ ] **Step 1: Write the E2E test**

Create `web/e2e/activity-column-mapping.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'

async function buildReaderExcelFile(
  rows: { ide: string; sexo?: string; sanidad?: string; sanidad2?: string; propietario?: string }[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Lectura')
  sheet.addRow(['IDE', 'IDV', 'Fecha', 'Hora', 'SEXO', 'SANIDAD', 'SANIDAD 2', 'PROPIETARIO', 'NOTA'])
  for (const row of rows) {
    sheet.addRow([row.ide, '', '', '', row.sexo ?? '', row.sanidad ?? '', row.sanidad2 ?? '', row.propietario ?? '', ''])
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test('a real reader export (IDE/SEXO/PROPIETARIO/two SANIDAD columns) maps, resolves owner/sex, and applies two products per animal', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e.manager.one.farm@test.local')
  await page.getByLabel('Contraseña').fill('e2e-test-password')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/actividades/nueva')
  await page.getByLabel('Tipo de actividad').selectOption('Sanidad')

  const excel = await buildReaderExcelFile([
    { ide: 'e2e-reader-001', sexo: 'H', sanidad: 'ASPERSIN', sanidad2: 'AFTOSA', propietario: 'Estancia La Postrera' },
  ])
  await page.getByLabel('Archivo Excel').setInputFiles({
    name: 'lectura.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: excel,
  })
  await page.getByRole('button', { name: 'Detectar columnas' }).click()

  await page.getByLabel('Significado de IDE').selectOption({ label: 'Caravana' })
  await page.getByLabel('Significado de SEXO').selectOption({ label: 'Sexo' })
  await page.getByLabel('Significado de PROPIETARIO').selectOption({ label: 'Propietario' })
  await page.getByLabel('Significado de SANIDAD', { exact: true }).selectOption({ label: 'Producto' })
  await page.getByLabel('Significado de SANIDAD 2').selectOption({ label: 'Producto' })

  // Both mapped "Producto" columns prefill one product row each from their
  // (assumed-uniform) column values — the real ASPERSIN/AFTOSA reader names
  // won't match the seeded catalog exactly, so the user picks manually.
  await expect(page.locator('select[id^="product-"]')).toHaveCount(2)
  await page.getByLabel('Producto').first().selectOption({ label: 'Ivermectina 1%' })
  await page.getByLabel('Dosis', { exact: true }).first().fill('10')
  await page.getByLabel('Unidad de dosis').first().fill('ml')
  await page.getByLabel('Vía de administración').first().fill('subcutánea')
  await page.getByLabel('Producto').nth(1).selectOption({ label: 'Aftosa' })
  await page.getByLabel('Dosis', { exact: true }).nth(1).fill('5')
  await page.getByLabel('Unidad de dosis').nth(1).fill('ml')
  await page.getByLabel('Vía de administración').nth(1).fill('intramuscular')

  await page.getByRole('button', { name: 'Validar' }).click()
  await expect(page.getByText('e2e-reader-001')).toBeVisible()
  await expect(page.getByText('Nueva')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/lote confirmado/i)).toBeVisible()
})
```

- [ ] **Step 2: Run it and confirm it passes**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase db reset
cd web
npx playwright test activity-column-mapping.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run the entire suite (regression check)**

```bash
cd /Users/salvadorpanissa/Documents/traceability
supabase test db
cd web
npm run test
npx playwright test
```

Expected: PASS — every pgTAP, Vitest, and Playwright test green, across every file touched or untouched by this plan.

- [ ] **Step 4: Commit**

```bash
cd /Users/salvadorpanissa/Documents/traceability
git add web/e2e/activity-column-mapping.spec.ts
git commit -m "test: add end-to-end coverage for a real reader export with column mapping"
```

---

## Post-plan note

This plan covers the full "Revisión" section of the spec: manual column mapping (remembered per header signature), multi-product sanidad, and the `sex`/`owner` fixed animal attributes — for both reference activities (traslado, sanidad). Recategorización, venta, and baja, when added later, follow the same evolved pattern: their `confirm_<activity>_batch` RPC gains the same `p_existing_animals`/`p_new_animals` per-row-date shape, and their new-animal rows carry `sex`/`owner_id` the same way. No further plan changes are needed there — those are separate follow-up plans, same as before this revision.
