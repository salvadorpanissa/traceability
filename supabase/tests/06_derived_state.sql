begin;
select plan(4);

select has_materialized_view('public', 'animal_current_state', 'animal_current_state exists');

-- Fixture: one animal, one farm it starts outside of, one farm it moves to.
select tests.create_supabase_user('derived_state_tester');
insert into public.farm (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Campo Norte'),
  ('22222222-2222-2222-2222-222222222222', 'Campo Sur');
insert into public.animal (id) values ('33333333-3333-3333-3333-333333333333');

insert into public.batch_operation (id, event_type, farm_id, animal_count, created_by)
values ('44444444-4444-4444-4444-444444444444', 'transfer', '11111111-1111-1111-1111-111111111111', 1,
        tests.get_supabase_user('derived_state_tester'));

insert into public.event (id, event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
values ('55555555-5555-5555-5555-555555555555', 'transfer', '2026-01-01', '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
        tests.get_supabase_user('derived_state_tester'));
insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id)
values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select results_eq(
  $$ select current_farm_id from public.animal_current_state where animal_id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values ('22222222-2222-2222-2222-222222222222'::uuid) $$,
  'derived state reflects the transfer destination farm after insert'
);

-- Void the transfer and confirm the animal falls back to "no current farm".
insert into public.batch_operation (id, event_type, farm_id, animal_count, created_by)
values ('66666666-6666-6666-6666-666666666666', 'void', '11111111-1111-1111-1111-111111111111', 1,
        tests.get_supabase_user('derived_state_tester'));
insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by, voids_event_id)
values ('void', '2026-01-02', '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666',
        tests.get_supabase_user('derived_state_tester'),
        '55555555-5555-5555-5555-555555555555');

select results_eq(
  $$ select current_farm_id from public.animal_current_state where animal_id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values (null::uuid) $$,
  'voided transfer is excluded from derived state'
);

select is(
  (select count(*) from public.event where event_type = 'transfer'),
  1::bigint,
  'the original transfer event row still exists (void does not delete history)'
);

select * from finish();
rollback;
