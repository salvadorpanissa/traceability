begin;
select plan(6);

select has_table('public', 'animal', 'animal table exists');
select col_is_pk('public', 'animal', 'id', 'animal.id is pk');
select hasnt_column('public', 'animal', 'current_farm_id', 'animal has no current_farm_id column (state is derived, not stored)');

select has_table('public', 'animal_tag_history', 'animal_tag_history table exists');
select fk_ok('animal_tag_history', 'animal_id', 'animal', 'id');
select col_not_null('public', 'animal_tag_history', 'tag', 'animal_tag_history.tag is not null');

select * from finish();
rollback;
