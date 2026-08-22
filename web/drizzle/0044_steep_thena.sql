CREATE TABLE "event_pesaje" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"weight_kg" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" DROP CONSTRAINT "event_type_check";--> statement-breakpoint
ALTER TABLE "event_pesaje" ADD CONSTRAINT "event_pesaje_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_type_check" CHECK ("event"."event_type" in ('transfer', 'health', 'retag', 'recategorize', 'sale', 'death', 'pesaje', 'void'));