begin;
select plan(6);

select has_table('public', 'category', 'category table exists');
select col_is_pk('public', 'category', 'id', 'category.id is pk');
select col_not_null('public', 'category', 'name', 'category.name is not null');

select has_table('public', 'product', 'product table exists');
select col_is_pk('public', 'product', 'id', 'product.id is pk');
select col_not_null('public', 'product', 'name', 'product.name is not null');

select * from finish();
rollback;
