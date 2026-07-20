begin;
select plan(8);

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
select lives_ok(
  $$ insert into public.paddock (farm_id, name) values ('b1111111-1111-1111-1111-111111111111', 'Potrero admin test') $$,
  'admin can create a paddock'
);
select tests.clear_authentication();

select * from finish();
rollback;
