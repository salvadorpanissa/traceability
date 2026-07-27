-- reporting_named.category_named (created in 0018, moved to the
-- reporting_named schema in 0019) selects sort_order directly from
-- category, so it must be dropped before the column can be dropped, then
-- recreated without it. Re-grants sex/min_age_months too, added to
-- category in an earlier migration but never surfaced to the read-only
-- reporting layer until now.
DROP VIEW reporting_named.category_named;
--> statement-breakpoint
ALTER TABLE "category" DROP COLUMN "sort_order";
--> statement-breakpoint
CREATE VIEW reporting_named.category_named AS SELECT id, name, sex, min_age_months FROM category;
--> statement-breakpoint
GRANT SELECT ON reporting_named.category_named TO reporting_ro;
