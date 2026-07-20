begin;
select plan(5);

select has_column('public', 'event_transfer', 'origin_paddock_id', 'event_transfer has origin_paddock_id');
select has_column('public', 'event_transfer', 'destination_paddock_id', 'event_transfer has destination_paddock_id');
select col_is_null('public', 'event_transfer', 'origin_paddock_id', 'origin_paddock_id is nullable');
select fk_ok('event_transfer', 'origin_paddock_id', 'paddock', 'id');
select col_is_null('public', 'event_transfer', 'destination_paddock_id', 'destination_paddock_id is nullable');

select * from finish();
rollback;
