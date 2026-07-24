ALTER TABLE "batch_operation" ADD COLUMN "guide_file_name" text;--> statement-breakpoint
ALTER TABLE "batch_operation" ADD COLUMN "guide_mime_type" text;--> statement-breakpoint
ALTER TABLE "batch_operation" ADD COLUMN "guide_file_data" bytea;