DROP INDEX "animal_tag_history_tag_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "animal_tag_history_tag_idx" ON "animal_tag_history" USING btree ("tag");