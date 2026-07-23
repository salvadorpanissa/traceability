-- Persistent read-only "named" views used for the natural-language reporting
-- feature (docs/superpowers/specs/2026-07-22-nl-query-dashboard-design.md).
-- These are always-current SQL views (not materialized) built on top of the
-- existing animal_current_state materialized view and event/event_* tables.
-- At request time, web/lib/dal/reporting/scoped-views.ts wraps each of these
-- in a farm-scoped TEMP VIEW (my_*) before handing the schema to the LLM.

create view animal_current_state_named as
select
  acs.animal_id,
  acs.current_tag,
  acs.current_farm_id,
  f.name as farm_name,
  acs.current_paddock_id,
  p.name as paddock_name,
  acs.current_category_id,
  c.name as category_name,
  a.owner_id,
  o.name as owner_name,
  acs.status
from animal_current_state acs
join animal a on a.id = acs.animal_id
left join farm f on f.id = acs.current_farm_id
left join paddock p on p.id = acs.current_paddock_id
left join category c on c.id = acs.current_category_id
left join owner o on o.id = a.owner_id;
--> statement-breakpoint

create view transfer_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  t.origin_farm_id,
  ofarm.name as origin_farm_name,
  t.destination_farm_id,
  dfarm.name as destination_farm_name,
  t.origin_paddock_id,
  opaddock.name as origin_paddock_name,
  t.destination_paddock_id,
  dpaddock.name as destination_paddock_name,
  t.guide_number,
  e.notes,
  e.created_at
from event e
join event_transfer t on t.event_id = e.id
join farm f on f.id = e.farm_id
left join farm ofarm on ofarm.id = t.origin_farm_id
left join farm dfarm on dfarm.id = t.destination_farm_id
left join paddock opaddock on opaddock.id = t.origin_paddock_id
left join paddock dpaddock on dpaddock.id = t.destination_paddock_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'transfer'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view health_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  h.product_id,
  pr.name as product_name,
  h.dose,
  h.dose_unit,
  h.route,
  h.withdrawal_days,
  h.notes as health_notes,
  e.notes,
  e.created_at
from event e
join event_health h on h.event_id = e.id
join farm f on f.id = e.farm_id
left join product pr on pr.id = h.product_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'health'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view retag_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  e.farm_id,
  f.name as farm_name,
  r.old_tag,
  r.new_tag,
  e.notes,
  e.created_at
from event e
join event_retag r on r.event_id = e.id
join farm f on f.id = e.farm_id
where e.event_type = 'retag'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view recategorize_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  r.old_category_id,
  oc.name as old_category_name,
  r.new_category_id,
  nc.name as new_category_name,
  e.notes,
  e.created_at
from event e
join event_recategorize r on r.event_id = e.id
join farm f on f.id = e.farm_id
left join category oc on oc.id = r.old_category_id
left join category nc on nc.id = r.new_category_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'recategorize'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view sale_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  s.buyer,
  s.price,
  s.weight_kg,
  e.notes,
  e.created_at
from event e
join event_sale s on s.event_id = e.id
join farm f on f.id = e.farm_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'sale'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

create view death_events_named as
select
  e.id as event_id,
  e.event_date,
  e.animal_id,
  acs.current_tag as animal_tag,
  e.farm_id,
  f.name as farm_name,
  d.cause,
  e.notes,
  e.created_at
from event e
join event_death d on d.event_id = e.id
join farm f on f.id = e.farm_id
left join animal_current_state acs on acs.animal_id = e.animal_id
where e.event_type = 'death'
  and not exists (select 1 from event v where v.event_type = 'void' and v.voids_event_id = e.id);
--> statement-breakpoint

do $$
begin
  if not exists (select from pg_roles where rolname = 'reporting_ro') then
    create role reporting_ro with login;
  end if;
end
$$;
--> statement-breakpoint

grant usage on schema public to reporting_ro;
--> statement-breakpoint

grant select on
  animal,
  farm,
  paddock,
  category,
  product,
  owner,
  event,
  event_transfer,
  event_health,
  event_retag,
  event_recategorize,
  event_sale,
  event_death,
  animal_current_state,
  animal_current_state_named,
  transfer_events_named,
  health_events_named,
  retag_events_named,
  recategorize_events_named,
  sale_events_named,
  death_events_named
to reporting_ro;
--> statement-breakpoint

alter role reporting_ro set statement_timeout = '5s';
