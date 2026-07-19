-- Named _mv (not the public-facing "animal_current_state" name) because
-- Postgres cannot enable Row Level Security on a materialized view at all
-- ("ALTER action ENABLE ROW SECURITY cannot be performed on relation ...
-- This operation is not supported for materialized views."). The RLS
-- migration (Task 8) wraps this in a security-invoker view named
-- public.animal_current_state that applies the farm-scoping filter itself.
create materialized view public.animal_current_state_mv as
with active_event as (
  select e.*
  from public.event e
  where e.event_type <> 'void'
    and not exists (
      select 1 from public.event v
      where v.event_type = 'void' and v.voids_event_id = e.id
    )
),
last_retag as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_tag
  from active_event ae
  join public.event_retag r on r.event_id = ae.id
  where ae.event_type = 'retag'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_transfer as (
  select distinct on (ae.animal_id) ae.animal_id, t.destination_farm_id
  from active_event ae
  join public.event_transfer t on t.event_id = ae.id
  where ae.event_type = 'transfer'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_recategorize as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_category_id
  from active_event ae
  join public.event_recategorize r on r.event_id = ae.id
  where ae.event_type = 'recategorize'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_sale as (
  select distinct on (ae.animal_id) ae.animal_id, ae.event_date, ae.created_at
  from active_event ae
  where ae.event_type = 'sale'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_death as (
  select distinct on (ae.animal_id) ae.animal_id, ae.event_date, ae.created_at
  from active_event ae
  where ae.event_type = 'death'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
)
select
  a.id as animal_id,
  lr.new_tag as current_tag,
  lt.destination_farm_id as current_farm_id,
  lc.new_category_id as current_category_id,
  case
    when ld.animal_id is not null
      and (ls.animal_id is null or (ld.event_date, ld.created_at) > (ls.event_date, ls.created_at))
      then 'dead'
    when ls.animal_id is not null then 'sold'
    else 'alive'
  end as status
from public.animal a
left join last_retag lr on lr.animal_id = a.id
left join last_transfer lt on lt.animal_id = a.id
left join last_recategorize lc on lc.animal_id = a.id
left join last_sale ls on ls.animal_id = a.id
left join last_death ld on ld.animal_id = a.id;

create unique index animal_current_state_mv_animal_id_idx on public.animal_current_state_mv(animal_id);

-- security definer: this runs inside a trigger fired by whatever role
-- performed the INSERT (e.g. an authenticated manager). That role won't
-- own animal_current_state_mv and has no reason to hold REFRESH privileges
-- on it directly, so the refresh itself must run with the function
-- owner's (postgres) privileges instead of the caller's.
create or replace function public.refresh_animal_current_state()
returns trigger
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.animal_current_state_mv;
  return null;
end;
$$;

-- A batch operation inserts one `event` row per animal, then a *separate*
-- statement inserts the matching child rows (event_transfer, event_health,
-- etc.). A trigger on `event` alone refreshes before the child data exists,
-- and nothing re-refreshes once the child row lands. So every table this
-- view reads from needs its own AFTER INSERT trigger.
create trigger event_refresh_animal_current_state
after insert on public.event
for each statement
execute function public.refresh_animal_current_state();

create trigger event_transfer_refresh_animal_current_state
after insert on public.event_transfer
for each statement
execute function public.refresh_animal_current_state();

create trigger event_health_refresh_animal_current_state
after insert on public.event_health
for each statement
execute function public.refresh_animal_current_state();

create trigger event_retag_refresh_animal_current_state
after insert on public.event_retag
for each statement
execute function public.refresh_animal_current_state();

create trigger event_recategorize_refresh_animal_current_state
after insert on public.event_recategorize
for each statement
execute function public.refresh_animal_current_state();

create trigger event_sale_refresh_animal_current_state
after insert on public.event_sale
for each statement
execute function public.refresh_animal_current_state();

create trigger event_death_refresh_animal_current_state
after insert on public.event_death
for each statement
execute function public.refresh_animal_current_state();
