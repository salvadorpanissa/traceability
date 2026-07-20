# Paddocks Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the already-implemented, merged database schema with a `paddock` (potrero) entity nested under `farm`, wire it into `event_transfer` and the derived-state view, as described in [`docs/superpowers/specs/2026-07-20-paddocks-schema-design.md`](../specs/2026-07-20-paddocks-schema-design.md).

**Architecture:** Purely additive SQL migrations on top of the existing `supabase/migrations/*.sql` sequence — no existing row, table, or policy is redefined with different meaning, only extended. The one exception is `animal_current_state_mv` (a materialized view): Postgres has no `ALTER MATERIALIZED VIEW ... AS` to add a computed column, so its migration drops and recreates the full derived-state pipeline (view, trigger, dependent policies) with `current_paddock_id` added — Task 3 covers this in isolation, verified against the full pre-existing 66-test pgTAP suite, not just its own new tests.

**Tech Stack:** Same as the existing schema — Supabase CLI, Postgres, pgTAP (`supabase test db`).

## Global Constraints

- Every migration in this plan is additive to a schema already in production use: no existing column is dropped, no existing row's meaning changes, no existing RLS policy's behavior changes (except being redefined identically after a required drop/recreate in Task 3 — same USING/CHECK expressions, verified byte-for-byte against the current migration).
- `paddock` is optional everywhere it's referenced (`origin_paddock_id`, `destination_paddock_id`, `current_paddock_id` are all nullable) — no existing data or code path that doesn't know about paddocks should break.
- The existing `event_transfer_insert` RLS policy (`is_admin() or (origin_farm_id = destination_farm_id and origin_farm_id in user_farm_ids())`) is not modified in this plan — per the spec, it already produces the desired behavior for potrero-to-potrero transfers within the same establishment.
- After Task 3's migration, the full pre-existing pgTAP suite (`supabase test db`, all files `00_sanity.sql` through `07_rls.sql`) must still pass — this is the regression gate for touching the derived-state pipeline.

---

## Task 1: `paddock` table and RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_create_paddock.sql`
- Create: `supabase/tests/08_paddock.sql`

**Interfaces:**
- Produces table: `public.paddock(id, farm_id, name)`.
- Produces RLS policies: `paddock_select` (own establishments or admin), `paddock_write` (admin only) — same shape as the existing `farm_select`/`farm_write` policies.
- Consumes: `public.farm` (existing), `public.is_admin()`/`public.user_farm_ids()` (existing, from the RLS migration), `tests.create_supabase_user`/`tests.get_supabase_user`/`tests.authenticate_as`/`tests.clear_authentication` (existing test helpers).

- [ ] **Step 1: Write the failing test (RED)**

Create `supabase/tests/08_paddock.sql`:

```sql
begin;
select plan(7);

select has_table('public', 'paddock', 'paddock table exists');
select col_is_pk('public', 'paddock', 'id', 'paddock.id is pk');
select fk_ok('paddock', 'farm_id', 'farm', 'id');
select col_not_null('public', 'paddock', 'name', 'paddock.name is not null');

-- RLS: manager sees only paddocks of their own farm
insert into public.farm (id, name) values
  ('b1111111-1111-1111-1111-111111111111', 'Campo Norte'),
  ('b2222222-2222-2222-2222-222222222222', 'Campo Sur');
insert into public.paddock (id, farm_id, name) values
  ('b3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111', 'Potrero 1'),
  ('b4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'Potrero A');

select tests.create_supabase_user('paddock_manager', 'paddock_manager@test.local', 'manager');
select tests.create_supabase_user('paddock_admin', 'paddock_admin@test.local', 'admin');
insert into public.user_farm (user_id, farm_id)
values (tests.get_supabase_user('paddock_manager'), 'b1111111-1111-1111-1111-111111111111');

select tests.authenticate_as('paddock_manager');
select is(
  (select count(*) from public.paddock)::int, 1,
  'manager sees only paddocks belonging to their own farm'
);
select throws_like(
  $$ insert into public.paddock (farm_id, name) values ('b1111111-1111-1111-1111-111111111111', 'Potrero nuevo') $$,
  '%row-level security policy for table "paddock"%',
  'manager cannot create a paddock (write is admin-only)'
);
select tests.clear_authentication();

select tests.authenticate_as('paddock_admin');
select is(
  (select count(*) from public.paddock)::int, 2,
  'admin sees paddocks across all farms'
);
select tests.clear_authentication();

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
supabase test db
```

Expected: FAIL — `relation "public.paddock" does not exist`.

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new create_paddock
```

Edit the generated `supabase/migrations/<timestamp>_create_paddock.sql`:

```sql
create table public.paddock (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farm(id),
  name text not null
);

grant select, insert, update, delete on public.paddock to authenticated;

alter table public.paddock enable row level security;

create policy paddock_select on public.paddock for select to authenticated using (
  public.is_admin() or farm_id in (select public.user_farm_ids())
);
create policy paddock_write on public.paddock for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
supabase test db
```

Expected: PASS — `1..7`, all ok, and all prior test files (`00`-`07`) still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: add paddock table with RLS scoped to the owning farm"
```

---

## Task 2: `event_transfer` gains optional paddock columns

**Files:**
- Modify (via new migration file, not editing the old one): `supabase/migrations/<timestamp>_add_paddock_to_event_transfer.sql`
- Create: `supabase/tests/09_event_transfer_paddock.sql`

**Interfaces:**
- Produces columns: `public.event_transfer.origin_paddock_id` (nullable, fk → `paddock`), `public.event_transfer.destination_paddock_id` (nullable, fk → `paddock`).
- Consumes: `public.event_transfer`, `public.paddock` (Task 1).

- [ ] **Step 1: Write the failing test (RED)**

Create `supabase/tests/09_event_transfer_paddock.sql`:

```sql
begin;
select plan(3);

select has_column('public', 'event_transfer', 'origin_paddock_id', 'event_transfer has origin_paddock_id');
select has_column('public', 'event_transfer', 'destination_paddock_id', 'event_transfer has destination_paddock_id');
select col_is_null('public', 'event_transfer', 'origin_paddock_id', 'origin_paddock_id is nullable');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
supabase test db
```

Expected: FAIL — `event_transfer` has no `origin_paddock_id` column.

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new add_paddock_to_event_transfer
```

Edit the generated file:

```sql
alter table public.event_transfer
  add column origin_paddock_id uuid references public.paddock(id),
  add column destination_paddock_id uuid references public.paddock(id);
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
supabase test db
```

Expected: PASS — `1..3`, all ok, all prior test files still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: add optional origin/destination paddock columns to event_transfer"
```

---

## Task 3: Derived state gains `current_paddock_id`

**Files:**
- Create: `supabase/migrations/<timestamp>_add_paddock_to_derived_state.sql`
- Create: `supabase/tests/10_derived_state_paddock.sql`

**Interfaces:**
- Produces: `public.animal_current_state_mv.current_paddock_id` (and therefore `public.animal_current_state.current_paddock_id`, since the wrapper view is `select *`).
- Rebuilds (identically, byte-for-byte except the one added column and its one added source line) all objects that depend on `animal_current_state_mv`: the view `animal_current_state`, the function `refresh_animal_current_state()`, its 7 triggers (on `event` and its 6 child tables), and the two RLS policies (`animal_select`, `animal_tag_history_select`) that reference the view.
- Consumes: `public.event_transfer.destination_paddock_id` (Task 2).

- [ ] **Step 1: Write the failing test (RED)**

Create `supabase/tests/10_derived_state_paddock.sql`:

```sql
begin;
select plan(3);

select has_column('public', 'animal_current_state_mv', 'current_paddock_id', 'animal_current_state_mv has current_paddock_id');

-- Fixture: one farm, two paddocks in it, one animal that moves between them.
select tests.create_supabase_user('paddock_derived_tester');
insert into public.farm (id, name) values ('c1111111-1111-1111-1111-111111111111', 'Campo Norte');
insert into public.paddock (id, farm_id, name) values
  ('c2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'Potrero 1'),
  ('c3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 'Potrero 2');
insert into public.animal (id) values ('c4444444-4444-4444-4444-444444444444');

insert into public.batch_operation (id, event_type, farm_id, animal_count, created_by)
values ('c5555555-5555-5555-5555-555555555555', 'transfer', 'c1111111-1111-1111-1111-111111111111', 1,
        tests.get_supabase_user('paddock_derived_tester'));
insert into public.event (id, event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
values ('c6666666-6666-6666-6666-666666666666', 'transfer', '2026-01-01', 'c4444444-4444-4444-4444-444444444444',
        'c1111111-1111-1111-1111-111111111111', 'c5555555-5555-5555-5555-555555555555',
        tests.get_supabase_user('paddock_derived_tester'));
insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, origin_paddock_id, destination_paddock_id)
values ('c6666666-6666-6666-6666-666666666666', 'c1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
        'c2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333333');

select results_eq(
  $$ select current_paddock_id from public.animal_current_state_mv where animal_id = 'c4444444-4444-4444-4444-444444444444' $$,
  $$ values ('c3333333-3333-3333-3333-333333333333'::uuid) $$,
  'derived state reflects the destination paddock after a potrero-to-potrero transfer'
);

-- A transfer with no paddock specified leaves current_paddock_id null.
insert into public.animal (id) values ('c7777777-7777-7777-7777-777777777777');
insert into public.batch_operation (id, event_type, farm_id, animal_count, created_by)
values ('c8888888-8888-8888-8888-888888888888', 'transfer', 'c1111111-1111-1111-1111-111111111111', 1,
        tests.get_supabase_user('paddock_derived_tester'));
insert into public.event (id, event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
values ('c9999999-9999-9999-9999-999999999999', 'transfer', '2026-01-01', 'c7777777-7777-7777-7777-777777777777',
        'c1111111-1111-1111-1111-111111111111', 'c8888888-8888-8888-8888-888888888888',
        tests.get_supabase_user('paddock_derived_tester'));
insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id)
values ('c9999999-9999-9999-9999-999999999999', 'c1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111');

select results_eq(
  $$ select current_paddock_id from public.animal_current_state_mv where animal_id = 'c7777777-7777-7777-7777-777777777777' $$,
  $$ values (null::uuid) $$,
  'a transfer without a paddock leaves current_paddock_id null'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
supabase test db
```

Expected: FAIL — `column "current_paddock_id" does not exist` on `animal_current_state_mv`.

- [ ] **Step 3: Write the migration (GREEN)**

```bash
supabase migration new add_paddock_to_derived_state
```

Edit the generated file:

```sql
-- Materialized views have no `ALTER ... AS` to add a computed column — the
-- defining query can only be replaced via DROP + CREATE. This drops every
-- object that depends on animal_current_state_mv, in dependency order, and
-- recreates each one identically except for the one added column below.

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

Expected: PASS — `1..3` for the new file, **and** all prior test files (`00_sanity.sql` through `09_event_transfer_paddock.sql`) still pass. This is the critical regression check for this task: the drop/recreate must reproduce `animal_select`/`animal_tag_history_select`/`event_transfer` RLS behavior identically, which the existing `07_rls.sql` test file already exercises.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: add current_paddock_id to the derived-state view"
```

---

## Post-plan note

This plan implements the schema prerequisite for "cargar caravanas y actividades" (currently paused). No frontend or paddock-management UI is included — potreros are created via Supabase Studio in the meantime, same as establishments today.
