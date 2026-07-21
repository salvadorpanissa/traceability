CREATE TABLE "event_death" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"cause" text
);
--> statement-breakpoint
CREATE TABLE "event_health" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"dose" numeric NOT NULL,
	"dose_unit" text NOT NULL,
	"route" text NOT NULL,
	"withdrawal_days" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "event_recategorize" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"old_category_id" uuid NOT NULL,
	"new_category_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_retag" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"old_tag" text NOT NULL,
	"new_tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sale" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"buyer" text,
	"price" numeric,
	"weight_kg" numeric
);
--> statement-breakpoint
CREATE TABLE "event_transfer" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"origin_farm_id" uuid NOT NULL,
	"destination_farm_id" uuid NOT NULL,
	"guide_number" text
);
--> statement-breakpoint
ALTER TABLE "event_death" ADD CONSTRAINT "event_death_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_health" ADD CONSTRAINT "event_health_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_health" ADD CONSTRAINT "event_health_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_recategorize" ADD CONSTRAINT "event_recategorize_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_recategorize" ADD CONSTRAINT "event_recategorize_old_category_id_category_id_fk" FOREIGN KEY ("old_category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_recategorize" ADD CONSTRAINT "event_recategorize_new_category_id_category_id_fk" FOREIGN KEY ("new_category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_retag" ADD CONSTRAINT "event_retag_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sale" ADD CONSTRAINT "event_sale_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_transfer" ADD CONSTRAINT "event_transfer_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_transfer" ADD CONSTRAINT "event_transfer_origin_farm_id_farm_id_fk" FOREIGN KEY ("origin_farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_transfer" ADD CONSTRAINT "event_transfer_destination_farm_id_farm_id_fk" FOREIGN KEY ("destination_farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;