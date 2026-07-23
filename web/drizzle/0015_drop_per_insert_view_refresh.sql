-- The AFTER INSERT triggers below ran `refresh materialized view concurrently
-- animal_current_state` once per statement, i.e. once per row inserted into
-- event or any event_* child table. Batch confirmations (transfer, health)
-- insert one row at a time in a loop, so a batch of N rows fired dozens of
-- full-view refreshes (N * up to ~10 for health batches). Each refresh scans
-- the full event history via several CTEs, so cost grows with total event
-- count — a few hundred rows in one batch made this O(n^2) and exhausted
-- memory/time. Batch confirmations now call refresh once after all inserts
-- instead of relying on these triggers.

drop trigger event_death_refresh_animal_current_state on event_death;
drop trigger event_sale_refresh_animal_current_state on event_sale;
drop trigger event_recategorize_refresh_animal_current_state on event_recategorize;
drop trigger event_retag_refresh_animal_current_state on event_retag;
drop trigger event_health_refresh_animal_current_state on event_health;
drop trigger event_transfer_refresh_animal_current_state on event_transfer;
drop trigger event_refresh_animal_current_state on event;
--> statement-breakpoint
drop function refresh_animal_current_state();
