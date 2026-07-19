begin;
select plan(2);

select has_extension('pgcrypto', 'pgcrypto extension is installed');
select has_extension('pgtap', 'pgtap extension is installed');

select * from finish();
rollback;
