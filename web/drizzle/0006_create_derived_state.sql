create materialized view animal_current_state as
with active_event as (
  select e.*
  from event e
  where e.event_type <> 'void'
    and not exists (
      select 1 from event v
      where v.event_type = 'void' and v.voids_event_id = e.id
    )
),
last_retag as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_tag
  from active_event ae
  join event_retag r on r.event_id = ae.id
  where ae.event_type = 'retag'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_transfer as (
  select distinct on (ae.animal_id) ae.animal_id, t.destination_farm_id
  from active_event ae
  join event_transfer t on t.event_id = ae.id
  where ae.event_type = 'transfer'
  order by ae.animal_id, ae.event_date desc, ae.created_at desc
),
last_recategorize as (
  select distinct on (ae.animal_id) ae.animal_id, r.new_category_id
  from active_event ae
  join event_recategorize r on r.event_id = ae.id
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
from animal a
left join last_retag lr on lr.animal_id = a.id
left join last_transfer lt on lt.animal_id = a.id
left join last_recategorize lc on lc.animal_id = a.id
left join last_sale ls on ls.animal_id = a.id
left join last_death ld on ld.animal_id = a.id;
--> statement-breakpoint
create unique index animal_current_state_animal_id_idx on animal_current_state(animal_id);
--> statement-breakpoint
create or replace function refresh_animal_current_state()
returns trigger
language plpgsql
as $$
begin
  refresh materialized view concurrently animal_current_state;
  return null;
end;
$$;
--> statement-breakpoint
create trigger event_refresh_animal_current_state
after insert on event
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_transfer_refresh_animal_current_state
after insert on event_transfer
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_health_refresh_animal_current_state
after insert on event_health
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_retag_refresh_animal_current_state
after insert on event_retag
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_recategorize_refresh_animal_current_state
after insert on event_recategorize
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_sale_refresh_animal_current_state
after insert on event_sale
for each statement
execute function refresh_animal_current_state();
--> statement-breakpoint
create trigger event_death_refresh_animal_current_state
after insert on event_death
for each statement
execute function refresh_animal_current_state();