CREATE TABLE "login_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempt_email_attempted_at_idx" ON "login_attempt" USING btree ("email","attempted_at");--> statement-breakpoint
CREATE INDEX "user_account_role_id_idx" ON "user_account" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_farm_farm_id_idx" ON "user_farm" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "animal_owner_id_idx" ON "animal" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "batch_operation_farm_id_idx" ON "batch_operation" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "batch_operation_created_by_idx" ON "batch_operation" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "event_farm_id_idx" ON "event" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "event_event_date_idx" ON "event" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "event_health_product_id_idx" ON "event_health" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "event_health_paddock_id_idx" ON "event_health" USING btree ("paddock_id");--> statement-breakpoint
CREATE INDEX "event_recategorize_old_category_id_idx" ON "event_recategorize" USING btree ("old_category_id");--> statement-breakpoint
CREATE INDEX "event_recategorize_new_category_id_idx" ON "event_recategorize" USING btree ("new_category_id");--> statement-breakpoint
CREATE INDEX "event_transfer_origin_farm_id_idx" ON "event_transfer" USING btree ("origin_farm_id");--> statement-breakpoint
CREATE INDEX "event_transfer_destination_farm_id_idx" ON "event_transfer" USING btree ("destination_farm_id");--> statement-breakpoint
CREATE INDEX "event_transfer_origin_paddock_id_idx" ON "event_transfer" USING btree ("origin_paddock_id");--> statement-breakpoint
CREATE INDEX "event_transfer_destination_paddock_id_idx" ON "event_transfer" USING btree ("destination_paddock_id");--> statement-breakpoint
CREATE INDEX "dicose_registration_owner_id_idx" ON "dicose_registration" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "dicose_registration_farm_id_idx" ON "dicose_registration" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "own_tag_dicose_registration_id_idx" ON "own_tag" USING btree ("dicose_registration_id");--> statement-breakpoint
CREATE INDEX "sale_settlement_batch_operation_id_idx" ON "sale_settlement" USING btree ("batch_operation_id");--> statement-breakpoint
CREATE INDEX "sale_settlement_created_by_idx" ON "sale_settlement" USING btree ("created_by");