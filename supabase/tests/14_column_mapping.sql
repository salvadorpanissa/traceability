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
