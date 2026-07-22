CREATE TABLE "dicose_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"dicose_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "own_tag" (
	"tag" text PRIMARY KEY NOT NULL,
	"dicose_registration_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dicose_registration" ADD CONSTRAINT "dicose_registration_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dicose_registration" ADD CONSTRAINT "dicose_registration_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_tag" ADD CONSTRAINT "own_tag_dicose_registration_id_dicose_registration_id_fk" FOREIGN KEY ("dicose_registration_id") REFERENCES "public"."dicose_registration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_tag" ADD CONSTRAINT "own_tag_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id") ON DELETE no action ON UPDATE no action;