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

-- Queried via the RLS-safe public.animal_current_state view, not the
-- underlying _mv — see the equivalent note in 11_confirm_transfer_batch.sql
-- (Task 2): the _mv is never granted to `authenticated`.
select is(
  (select current_farm_id from public.animal_current_state acs
   join public.animal_tag_history h on h.animal_id = acs.animal_id
   where h.tag = '777'),
  'e1111111-1111-1111-1111-111111111111'::uuid,
  'the new animal is placed in the operating farm via the internal self-transfer'
);

select is(
  (select current_paddock_id from public.animal_current_state acs
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
