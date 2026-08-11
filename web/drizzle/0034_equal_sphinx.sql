-- group_id columns start nullable on purpose: existing farm/category/product
-- rows in a real database have no group yet, and there's no single default
-- that's correct for all of them. db/backfill-farm-groups.ts fills every row,
-- then migration 0035 tightens these to NOT NULL + unique(group_id, name).
CREATE TABLE "farm_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" DROP CONSTRAINT "category_name_unique";--> statement-breakpoint
ALTER TABLE "product" DROP CONSTRAINT "product_name_unique";--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "farm" ADD CONSTRAINT "farm_group_id_farm_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."farm_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_group_id_farm_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."farm_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_group_id_farm_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."farm_group"("id") ON DELETE no action ON UPDATE no action;