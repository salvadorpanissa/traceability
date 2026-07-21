CREATE TABLE "batch_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"farm_id" uuid NOT NULL,
	"selection_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"animal_count" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"event_date" date NOT NULL,
	"animal_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"batch_operation_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voids_event_id" uuid,
	CONSTRAINT "event_type_check" CHECK ("event"."event_type" in ('transfer', 'health', 'retag', 'recategorize', 'sale', 'death', 'void')),
	CONSTRAINT "event_voids_only_when_void" CHECK (("event"."event_type" = 'void' and "event"."voids_event_id" is not null) or ("event"."event_type" <> 'void' and "event"."voids_event_id" is null))
);
--> statement-breakpoint
ALTER TABLE "batch_operation" ADD CONSTRAINT "batch_operation_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_operation" ADD CONSTRAINT "batch_operation_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_batch_operation_id_batch_operation_id_fk" FOREIGN KEY ("batch_operation_id") REFERENCES "public"."batch_operation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_voids_event_id_event_id_fk" FOREIGN KEY ("voids_event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_animal_id_idx" ON "event" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "event_batch_operation_id_idx" ON "event" USING btree ("batch_operation_id");