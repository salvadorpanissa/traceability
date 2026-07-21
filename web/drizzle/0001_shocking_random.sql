CREATE TABLE "user_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_account_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_farm" (
	"user_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	CONSTRAINT "user_farm_user_id_farm_id_pk" PRIMARY KEY("user_id","farm_id")
);
--> statement-breakpoint
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_farm" ADD CONSTRAINT "user_farm_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_farm" ADD CONSTRAINT "user_farm_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;