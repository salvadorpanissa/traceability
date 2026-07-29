ALTER TABLE "animal" ADD COLUMN "breed" text;--> statement-breakpoint
ALTER TABLE "animal_tag_history" ADD COLUMN "secondary_tag" text;--> statement-breakpoint
CREATE UNIQUE INDEX "animal_tag_history_secondary_tag_idx" ON "animal_tag_history" USING btree ("secondary_tag");