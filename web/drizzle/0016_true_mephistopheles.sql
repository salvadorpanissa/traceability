ALTER TABLE "own_tag" ADD COLUMN "sex" "animal_sex";--> statement-breakpoint
ALTER TABLE "own_tag" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "own_tag" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "own_tag" ADD CONSTRAINT "own_tag_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;