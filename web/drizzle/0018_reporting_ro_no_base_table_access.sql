-- Closes a cross-farm data leak found in review of the NL-query reporting
-- feature: reporting_ro previously had direct SELECT on every base table
-- and the animal_current_state materialized view (migration 0017), granted
-- only so it could CREATE the per-request farm-scoped TEMP VIEWs in
-- web/lib/dal/reporting/scoped-views.ts (each temp view's creator needs
-- SELECT on whatever it selects FROM). That same direct grant meant any
-- query text — including one that slipped past the SQL validator's my_*
-- table whitelist — could read `SELECT * FROM farm` (or animal, event, the
-- materialized view, etc.) directly and see every farm's rows, bypassing
-- the farm-scoped my_* views entirely.
--
-- Fix: reporting_ro now only ever holds SELECT on named, always-unscoped
-- views — never on a table or materialized view directly. This migration
-- adds the five simple passthrough views (farm/paddock/category/product/
-- owner) needed to complete that set; 0017 already added the seven
-- event/state ones (animal_current_state_named, *_events_named).
--
-- This works because a Postgres view runs its defining query with its
-- OWNER's privileges on the underlying sources, not the querying role's.
-- These views are created by the migration role (which already owns every
-- base table), so reporting_ro can still build its per-request TEMP VIEWs
-- on top of them — it just can no longer reach a base table by any other
-- query text, regardless of what SQL a query ends up running.

revoke select on
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
  animal_current_state
from reporting_ro;
--> statement-breakpoint

create view farm_named as
select id, name
from farm;
--> statement-breakpoint

create view paddock_named as
select id, name, farm_id
from paddock;
--> statement-breakpoint

create view category_named as
select id, name, sort_order
from category;
--> statement-breakpoint

create view product_named as
select id, name, default_dose_unit, default_withdrawal_days
from product;
--> statement-breakpoint

create view owner_named as
select id, name
from owner;
--> statement-breakpoint

grant select on farm_named, paddock_named, category_named, product_named, owner_named to reporting_ro;
