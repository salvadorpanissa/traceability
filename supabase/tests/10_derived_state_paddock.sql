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
