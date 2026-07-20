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
  ('d4444444-4444-4444-4444-444444444444', 'd1111111-1111-1111-1111-111111111111', 'Potrero 2'),
  ('d9999999-9999-9999-9999-999999999999', 'd2222222-2222-2222-2222-222222222222', 'Potrero Sur');
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

-- Queried via the RLS-safe public.animal_current_state view, not the
-- underlying _mv directly: the session is authenticated as the manager
-- here (an ordinary `authenticated` role), which has no grant on the raw
-- materialized view (see 20260719140527_create_rls_policies.sql) - only
-- postgres/superuser can read _mv directly, which is what the earlier,
-- unauthenticated assertions in 10_derived_state_paddock.sql rely on.
select is(
  (select current_paddock_id from public.animal_current_state where animal_id = 'd6666666-6666-6666-6666-666666666666'),
  'd4444444-4444-4444-4444-444444444444'::uuid,
  'the existing animal now shows Potrero 2 as its current paddock'
);

select is(
  (select acs.current_tag from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '999'),
  '999',
  'the new animal has current_tag 999, derived from the self-retag event'
);

select is(
  (select acs.current_category_id from public.animal_current_state acs
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
       'd9999999-9999-9999-9999-999999999999'::uuid,
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
