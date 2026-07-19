begin;
select plan(18);

select has_table('public', 'event_transfer', 'event_transfer table exists');
select col_is_pk('public', 'event_transfer', 'event_id', 'event_transfer.event_id is pk');
select fk_ok('event_transfer', 'origin_farm_id', 'farm', 'id');
select fk_ok('event_transfer', 'destination_farm_id', 'farm', 'id');

select has_table('public', 'event_health', 'event_health table exists');
select col_is_pk('public', 'event_health', 'event_id', 'event_health.event_id is pk');
select fk_ok('event_health', 'product_id', 'product', 'id');
select col_not_null('public', 'event_health', 'dose', 'event_health.dose is not null');

select has_table('public', 'event_retag', 'event_retag table exists');
select col_is_pk('public', 'event_retag', 'event_id', 'event_retag.event_id is pk');
select col_not_null('public', 'event_retag', 'new_tag', 'event_retag.new_tag is not null');

select has_table('public', 'event_recategorize', 'event_recategorize table exists');
select fk_ok('event_recategorize', 'old_category_id', 'category', 'id');
select fk_ok('event_recategorize', 'new_category_id', 'category', 'id');

select has_table('public', 'event_sale', 'event_sale table exists');
select col_is_pk('public', 'event_sale', 'event_id', 'event_sale.event_id is pk');

select has_table('public', 'event_death', 'event_death table exists');
select col_is_pk('public', 'event_death', 'event_id', 'event_death.event_id is pk');

select * from finish();
rollback;
