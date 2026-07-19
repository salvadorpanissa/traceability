begin;
select plan(9);

select has_table('public', 'batch_operation', 'batch_operation table exists');
select fk_ok('batch_operation', 'farm_id', 'farm', 'id');
select fk_ok('batch_operation', 'created_by', 'user_account', 'id');

select has_table('public', 'event', 'event table exists');
select fk_ok('event', 'animal_id', 'animal', 'id');
select fk_ok('event', 'farm_id', 'farm', 'id');
select fk_ok('event', 'batch_operation_id', 'batch_operation', 'id');
select fk_ok('event', 'voids_event_id', 'event', 'id');

select throws_like(
  $$ insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
     values ('transfer', current_date, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
  '%violates%',
  'event insert fails when referenced ids do not exist (fk enforced)'
);

select * from finish();
rollback;
