CREATE TABLE "reproductive_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reproductive_status_farm_id_name_unique" UNIQUE("farm_id","name")
);
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "reproductive_status_id" uuid;--> statement-breakpoint
ALTER TABLE "reproductive_status" ADD CONSTRAINT "reproductive_status_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_reproductive_status_id_reproductive_status_id_fk" FOREIGN KEY ("reproductive_status_id") REFERENCES "public"."reproductive_status"("id") ON DELETE no action ON UPDATE no action;