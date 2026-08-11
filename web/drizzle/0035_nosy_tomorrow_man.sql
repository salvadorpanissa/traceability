ALTER TABLE "farm" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_group_id_name_unique" UNIQUE("group_id","name");--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_group_id_name_unique" UNIQUE("group_id","name");