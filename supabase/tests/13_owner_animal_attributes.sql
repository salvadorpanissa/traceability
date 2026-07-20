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

select tests.authenticate_as('owner_manager');
select throws_like(
  $$ insert into public.animal (id, sex) values (gen_random_uuid(), 'X') $$,
  '%animal_sex_check%',
  'animal.sex rejects a value outside M/H'
);
select tests.clear_authentication();

select * from finish();
rollback;
