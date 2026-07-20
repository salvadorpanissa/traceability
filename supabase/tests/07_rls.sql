begin;
select plan(6);

-- Fixture: two farms, a manager scoped to Norte only, an admin, one animal per farm.
insert into public.farm (id, name) values
  ('a1111111-1111-1111-1111-111111111111', 'Campo Norte'),
  ('a2222222-2222-2222-2222-222222222222', 'Campo Sur');

select tests.create_supabase_user('rls_manager', 'manager@test.local', 'manager');
select tests.create_supabase_user('rls_admin', 'admin@test.local', 'admin');

insert into public.user_farm (user_id, farm_id)
values (tests.get_supabase_user('rls_manager'), 'a1111111-1111-1111-1111-111111111111');

insert into public.animal (id) values
  ('a3333333-3333-3333-3333-333333333333'),
  ('a4444444-4444-4444-4444-444444444444');

insert into public.batch_operation (id, event_type, farm_id, animal_count, created_by) values
  ('a5555555-5555-5555-5555-555555555555', 'transfer', 'a1111111-1111-1111-1111-111111111111', 1, tests.get_supabase_user('rls_admin')),
  ('a6666666-6666-6666-6666-666666666666', 'transfer', 'a2222222-2222-2222-2222-222222222222', 1, tests.get_supabase_user('rls_admin'));

insert into public.event (id, event_type, event_date, animal_id, farm_id, batch_operation_id, created_by) values
  ('a7777777-7777-7777-7777-777777777777', 'transfer', '2026-01-01', 'a3333333-3333-3333-3333-333333333333',
   'a1111111-1111-1111-1111-111111111111', 'a5555555-5555-5555-5555-555555555555', tests.get_supabase_user('rls_admin')),
  ('a8888888-8888-8888-8888-888888888888', 'transfer', '2026-01-01', 'a4444444-4444-4444-4444-444444444444',
   'a2222222-2222-2222-2222-222222222222', 'a6666666-6666-6666-6666-666666666666', tests.get_supabase_user('rls_admin'));

insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id) values
  ('a7777777-7777-7777-7777-777777777777', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111'),
  ('a8888888-8888-8888-8888-888888888888', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222');

-- A third event, in Campo Norte, deliberately left without its event_transfer child row yet —
-- used below to test that a manager cannot attach a cross-farm event_transfer to it.
insert into public.event (id, event_type, event_date, animal_id, farm_id, batch_operation_id, created_by) values
  ('a9999999-9999-9999-9999-999999999999', 'transfer', '2026-01-01', 'a3333333-3333-3333-3333-333333333333',
   'a1111111-1111-1111-1111-111111111111', 'a5555555-5555-5555-5555-555555555555', tests.get_supabase_user('rls_admin'));

-- manager sees only Campo Norte
select tests.authenticate_as('rls_manager');

select is(
  (select count(*) from public.farm)::int, 1,
  'manager sees only their own farm'
);
select is(
  (select count(*) from public.animal_current_state where current_farm_id is not null)::int, 1,
  'manager sees only animals currently in their own farm'
);
select throws_like(
  $$ insert into public.batch_operation (event_type, farm_id, animal_count, created_by)
     values ('transfer', 'a2222222-2222-2222-2222-222222222222', 1, tests.get_supabase_user('rls_manager')) $$,
  '%row-level security policy for table "batch_operation"%',
  'manager cannot create a batch_operation for a farm that is not theirs'
);
select throws_like(
  $$ insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id)
     values ('a9999999-9999-9999-9999-999999999999', 'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  '%row-level security policy for table "event_transfer"%',
  'manager cannot create a cross-farm transfer'
);

select tests.clear_authentication();

-- admin sees everything
select tests.authenticate_as('rls_admin');
select is(
  (select count(*) from public.farm
   where id in ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222'))::int, 2,
  'admin sees all farms'
);
select is(
  (select count(*) from public.animal_current_state where current_farm_id is not null)::int, 2,
  'admin sees all animals regardless of farm'
);

select tests.clear_authentication();
select * from finish();
rollback;
