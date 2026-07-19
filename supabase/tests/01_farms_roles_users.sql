begin;
select plan(15);

-- farm
select has_table('public', 'farm', 'farm table exists');
select has_column('public', 'farm', 'dicose_code', 'farm has dicose_code');
select has_column('public', 'farm', 'ruc', 'farm has ruc');
select col_is_pk('public', 'farm', 'id', 'farm.id is pk');

-- role
select has_table('public', 'role', 'role table exists');
select col_is_pk('public', 'role', 'id', 'role.id is pk');

-- user_account
select has_table('public', 'user_account', 'user_account table exists');
select fk_ok('user_account', 'role_id', 'role', 'id');

-- user_farm
select has_table('public', 'user_farm', 'user_farm table exists');
select fk_ok('user_farm', 'user_id', 'user_account', 'id');
select fk_ok('user_farm', 'farm_id', 'farm', 'id');

-- seed data
select results_eq(
  $$ select name from public.role order by name $$,
  $$ values ('admin'), ('manager') $$,
  'role table is seeded with admin and manager'
);

-- test helper: create + authenticate a user, all keyed by identifier (no uuid juggling)
select lives_ok(
  $$ select tests.create_supabase_user('seed_check_user') $$,
  'tests.create_supabase_user runs without error'
);
select lives_ok(
  $$ select tests.authenticate_as('seed_check_user') $$,
  'tests.authenticate_as runs without error'
);
select lives_ok(
  $$ select tests.clear_authentication() $$,
  'tests.clear_authentication runs without error'
);

select * from finish();
rollback;
