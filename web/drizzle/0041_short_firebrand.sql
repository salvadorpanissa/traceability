ALTER TABLE "owner" DROP CONSTRAINT "owner_name_unique";--> statement-breakpoint
ALTER TABLE "owner" ADD COLUMN "farm_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "owner" ADD CONSTRAINT "owner_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner" ADD CONSTRAINT "owner_farm_id_name_unique" UNIQUE("farm_id","name");