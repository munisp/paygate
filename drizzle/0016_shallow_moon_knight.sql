CREATE TYPE "public"."ptsp_batch_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed', 'partial');--> statement-breakpoint
CREATE TABLE "ptsp_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"settlement_date" text NOT NULL,
	"status" "ptsp_batch_status" DEFAULT 'pending' NOT NULL,
	"nibss_reference" text,
	"total_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp,
	"confirmed_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "soundbox_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
CREATE INDEX "ptsp_batch_merchant_idx" ON "ptsp_batches" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ptsp_batch_date_idx" ON "ptsp_batches" USING btree ("settlement_date");--> statement-breakpoint
CREATE INDEX "ptsp_batch_status_idx" ON "ptsp_batches" USING btree ("status");