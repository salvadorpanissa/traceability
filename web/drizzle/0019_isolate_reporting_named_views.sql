-- Hardens the defense-in-depth for the 12 reporting *_named views. 0018
-- closed the base-table bypass (reporting_ro can no longer read `farm`,
-- `animal`, `event`, etc. directly), but the 12 named views themselves
-- (animal_current_state_named, *_events_named, farm_named, paddock_named,
-- category_named, product_named, owner_named) are still unscoped and still
-- directly SELECT-able by reporting_ro — that grant is unavoidable, since a
-- temp view's query runs with reporting_ro's own privileges on whatever it
-- selects FROM. The only thing stopping an LLM-generated query from reading
-- e.g. `farm_named` directly (all farms, unscoped) instead of going through
-- the farm-scoped `my_farms` temp view is the SQL validator's table
-- whitelist (web/lib/dal/reporting/sql-validator.ts) — a single layer, not
-- defense-in-depth, for this specific path.
--
-- Fix: move all 12 named views into a dedicated `reporting_named` schema
-- that is never added to reporting_ro's search_path. Trusted application
-- code (web/lib/dal/reporting/scoped-views.ts) references them
-- schema-qualified when building the per-request farm-scoped TEMP VIEWs.
-- An LLM query referencing `farm_named` unqualified now fails to resolve at
-- all (the schema isn't searched); a schema-qualified reference
-- (`reporting_named.farm_named`) is independently rejected by the SQL
-- validator's existing schema_qualified_table check. Two independent layers
-- instead of one. Existing SELECT grants on these view objects are
-- unaffected by the schema move (privileges attach to the object, not its
-- schema location), so no re-grant is needed.

create schema reporting_named;
--> statement-breakpoint

grant usage on schema reporting_named to reporting_ro;
--> statement-breakpoint

alter view animal_current_state_named set schema reporting_named;
--> statement-breakpoint
alter view transfer_events_named set schema reporting_named;
--> statement-breakpoint
alter view health_events_named set schema reporting_named;
--> statement-breakpoint
alter view retag_events_named set schema reporting_named;
--> statement-breakpoint
alter view recategorize_events_named set schema reporting_named;
--> statement-breakpoint
alter view sale_events_named set schema reporting_named;
--> statement-breakpoint
alter view death_events_named set schema reporting_named;
--> statement-breakpoint
alter view farm_named set schema reporting_named;
--> statement-breakpoint
alter view paddock_named set schema reporting_named;
--> statement-breakpoint
alter view category_named set schema reporting_named;
--> statement-breakpoint
alter view product_named set schema reporting_named;
--> statement-breakpoint
alter view owner_named set schema reporting_named;
