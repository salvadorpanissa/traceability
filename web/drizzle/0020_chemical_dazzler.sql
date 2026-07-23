ALTER TABLE "own_tag" DROP CONSTRAINT "own_tag_category_id_category_id_fk";
--> statement-breakpoint
ALTER TABLE "own_tag" DROP CONSTRAINT "own_tag_created_by_user_account_id_fk";
--> statement-breakpoint
ALTER TABLE "own_tag" DROP COLUMN "sex";--> statement-breakpoint
ALTER TABLE "own_tag" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "own_tag" DROP COLUMN "birth_date";--> statement-breakpoint
ALTER TABLE "own_tag" DROP COLUMN "created_by";