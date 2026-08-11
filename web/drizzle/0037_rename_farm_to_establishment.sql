-- Renames the naming scheme throughout the schema to match the new
-- farm/establishment model: the old "farm" (a single physical property) is
-- now "establishment", and the old "farm_group" (a set of establecimientos
-- sharing one catalog) takes over the freed-up "farm" name. Every rename
-- below is a pure ALTER ... RENAME (table, column, constraint, index, view,
-- or materialized view column) — none of it touches data, so no backfill or
-- separate-transaction staging is needed the way the earlier nullable ->
-- backfill -> NOT NULL migrations did.
--
-- Order matters only where a name is freed by one statement and claimed by
-- another: "farm" must be renamed to "establishment" before "farm_group" can
-- take the name "farm".

-- ============================================================
-- 1. Table renames
-- ============================================================

ALTER TABLE "farm" RENAME TO "establishment";
--> statement-breakpoint
ALTER TABLE "farm_group" RENAME TO "farm";
--> statement-breakpoint
ALTER TABLE "user_farm" RENAME TO "user_establishment";
--> statement-breakpoint
ALTER TABLE "dicose_registration" RENAME TO "dicose";

-- ============================================================
-- 2. Column renames
-- ============================================================

--> statement-breakpoint
ALTER TABLE "establishment" RENAME COLUMN "group_id" TO "farm_id";
--> statement-breakpoint
ALTER TABLE "paddock" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER TABLE "batch_operation" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER TABLE "event" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER TABLE "event_transfer" RENAME COLUMN "origin_farm_id" TO "origin_establishment_id";
--> statement-breakpoint
ALTER TABLE "event_transfer" RENAME COLUMN "destination_farm_id" TO "destination_establishment_id";
--> statement-breakpoint
ALTER TABLE "category" RENAME COLUMN "group_id" TO "farm_id";
--> statement-breakpoint
ALTER TABLE "product" RENAME COLUMN "group_id" TO "farm_id";
--> statement-breakpoint
ALTER TABLE "user_establishment" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER TABLE "dicose" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER TABLE "own_tag" RENAME COLUMN "dicose_registration_id" TO "dicose_id";

-- ============================================================
-- 3. Primary key constraint renames (cosmetic, no behavior change —
--    Postgres does not auto-rename constraints when their table is renamed)
-- ============================================================

--> statement-breakpoint
ALTER TABLE "establishment" RENAME CONSTRAINT "farm_pkey" TO "establishment_pkey";
--> statement-breakpoint
ALTER TABLE "farm" RENAME CONSTRAINT "farm_group_pkey" TO "farm_pkey";
--> statement-breakpoint
ALTER TABLE "dicose" RENAME CONSTRAINT "dicose_registration_pkey" TO "dicose_pkey";
--> statement-breakpoint
ALTER TABLE "user_establishment" RENAME CONSTRAINT "user_farm_user_id_farm_id_pk" TO "user_establishment_user_id_establishment_id_pk";

-- ============================================================
-- 4. Foreign key constraint renames
-- ============================================================

--> statement-breakpoint
ALTER TABLE "establishment" RENAME CONSTRAINT "farm_group_id_farm_group_id_fk" TO "establishment_farm_id_farm_id_fk";
--> statement-breakpoint
ALTER TABLE "paddock" RENAME CONSTRAINT "paddock_farm_id_farm_id_fk" TO "paddock_establishment_id_establishment_id_fk";
--> statement-breakpoint
ALTER TABLE "batch_operation" RENAME CONSTRAINT "batch_operation_farm_id_farm_id_fk" TO "batch_operation_establishment_id_establishment_id_fk";
--> statement-breakpoint
ALTER TABLE "event" RENAME CONSTRAINT "event_farm_id_farm_id_fk" TO "event_establishment_id_establishment_id_fk";
--> statement-breakpoint
ALTER TABLE "event_transfer" RENAME CONSTRAINT "event_transfer_origin_farm_id_farm_id_fk" TO "event_transfer_origin_establishment_id_establishment_id_fk";
--> statement-breakpoint
ALTER TABLE "event_transfer" RENAME CONSTRAINT "event_transfer_destination_farm_id_farm_id_fk" TO "event_transfer_destination_establishment_id_establishment_id_fk";
--> statement-breakpoint
ALTER TABLE "category" RENAME CONSTRAINT "category_group_id_farm_group_id_fk" TO "category_farm_id_farm_id_fk";
--> statement-breakpoint
ALTER TABLE "product" RENAME CONSTRAINT "product_group_id_farm_group_id_fk" TO "product_farm_id_farm_id_fk";
--> statement-breakpoint
ALTER TABLE "user_establishment" RENAME CONSTRAINT "user_farm_farm_id_farm_id_fk" TO "user_establishment_establishment_id_establishment_id_fk";
--> statement-breakpoint
ALTER TABLE "user_establishment" RENAME CONSTRAINT "user_farm_user_id_user_account_id_fk" TO "user_establishment_user_id_user_account_id_fk";
--> statement-breakpoint
ALTER TABLE "dicose" RENAME CONSTRAINT "dicose_registration_farm_id_farm_id_fk" TO "dicose_establishment_id_establishment_id_fk";
--> statement-breakpoint
ALTER TABLE "dicose" RENAME CONSTRAINT "dicose_registration_owner_id_owner_id_fk" TO "dicose_owner_id_owner_id_fk";
--> statement-breakpoint
ALTER TABLE "own_tag" RENAME CONSTRAINT "own_tag_dicose_registration_id_dicose_registration_id_fk" TO "own_tag_dicose_id_dicose_id_fk";

-- ============================================================
-- 5. Unique constraint renames
-- ============================================================

--> statement-breakpoint
ALTER TABLE "paddock" RENAME CONSTRAINT "paddock_farm_id_name_unique" TO "paddock_establishment_id_name_unique";
--> statement-breakpoint
ALTER TABLE "category" RENAME CONSTRAINT "category_group_id_name_unique" TO "category_farm_id_name_unique";
--> statement-breakpoint
ALTER TABLE "product" RENAME CONSTRAINT "product_group_id_name_unique" TO "product_farm_id_name_unique";

-- ============================================================
-- 6. Index renames
-- ============================================================

--> statement-breakpoint
ALTER INDEX "batch_operation_farm_id_idx" RENAME TO "batch_operation_establishment_id_idx";
--> statement-breakpoint
ALTER INDEX "event_farm_id_idx" RENAME TO "event_establishment_id_idx";
--> statement-breakpoint
ALTER INDEX "event_transfer_origin_farm_id_idx" RENAME TO "event_transfer_origin_establishment_id_idx";
--> statement-breakpoint
ALTER INDEX "event_transfer_destination_farm_id_idx" RENAME TO "event_transfer_destination_establishment_id_idx";
--> statement-breakpoint
ALTER INDEX "user_farm_farm_id_idx" RENAME TO "user_establishment_establishment_id_idx";
--> statement-breakpoint
ALTER INDEX "dicose_registration_owner_id_idx" RENAME TO "dicose_owner_id_idx";
--> statement-breakpoint
ALTER INDEX "dicose_registration_farm_id_idx" RENAME TO "dicose_establishment_id_idx";
--> statement-breakpoint
ALTER INDEX "own_tag_dicose_registration_id_idx" RENAME TO "own_tag_dicose_id_idx";

-- ============================================================
-- 7. animal_current_state materialized view: rename exposed columns.
--    ALTER MATERIALIZED VIEW ... RENAME COLUMN is metadata-only (like a
--    table column rename) — no reindex, no refresh, no downtime, and the
--    view keeps its existing data and its animal_id unique index intact.
-- ============================================================

--> statement-breakpoint
ALTER MATERIALIZED VIEW "animal_current_state" RENAME COLUMN "current_farm_id" TO "current_establishment_id";

-- ============================================================
-- 8. Reporting layer: the 12 read-only views in the `reporting_named`
--    schema (see 0017/0018/0019/0025) are plain views built directly on the
--    renamed tables/columns above. Renaming a table or column never changes
--    a dependent view's own exposed column names (those are fixed at CREATE
--    VIEW time) or the view's own name, so each one needs an explicit
--    rename to keep matching what the app code (scoped-views.ts,
--    generate-sql.ts, column-labels.ts) now expects. farm_named itself is
--    renamed to establishment_named, since it has always been the old
--    single-establecimiento "farm" table's passthrough, not the new
--    farm-group concept.
-- ============================================================

--> statement-breakpoint
ALTER VIEW "reporting_named"."farm_named" RENAME TO "establishment_named";
--> statement-breakpoint
ALTER VIEW "reporting_named"."animal_current_state_named" RENAME COLUMN "current_farm_id" TO "current_establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."animal_current_state_named" RENAME COLUMN "farm_name" TO "establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."paddock_named" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."transfer_events_named" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."transfer_events_named" RENAME COLUMN "farm_name" TO "establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."transfer_events_named" RENAME COLUMN "origin_farm_id" TO "origin_establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."transfer_events_named" RENAME COLUMN "origin_farm_name" TO "origin_establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."transfer_events_named" RENAME COLUMN "destination_farm_id" TO "destination_establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."transfer_events_named" RENAME COLUMN "destination_farm_name" TO "destination_establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."health_events_named" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."health_events_named" RENAME COLUMN "farm_name" TO "establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."retag_events_named" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."retag_events_named" RENAME COLUMN "farm_name" TO "establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."recategorize_events_named" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."recategorize_events_named" RENAME COLUMN "farm_name" TO "establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."sale_events_named" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."sale_events_named" RENAME COLUMN "farm_name" TO "establishment_name";
--> statement-breakpoint
ALTER VIEW "reporting_named"."death_events_named" RENAME COLUMN "farm_id" TO "establishment_id";
--> statement-breakpoint
ALTER VIEW "reporting_named"."death_events_named" RENAME COLUMN "farm_name" TO "establishment_name";
