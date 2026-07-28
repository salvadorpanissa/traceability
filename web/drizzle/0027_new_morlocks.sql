CREATE TABLE "sale_settlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_operation_id" uuid NOT NULL,
	"guide_number" text NOT NULL,
	"frigorifico" text NOT NULL,
	"weigh_date" date NOT NULL,
	"total_amount" numeric NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_data" bytea NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_settlement" ADD CONSTRAINT "sale_settlement_batch_operation_id_batch_operation_id_fk" FOREIGN KEY ("batch_operation_id") REFERENCES "public"."batch_operation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_settlement" ADD CONSTRAINT "sale_settlement_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id") ON DELETE no action ON UPDATE no action;