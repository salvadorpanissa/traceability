CREATE TYPE "public"."animal_sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "owner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "owner_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "sex" "animal_sex";--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;