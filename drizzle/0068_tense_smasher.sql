CREATE TYPE "public"."offline_queue_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."offline_queue_status" AS ENUM('pending', 'syncing', 'synced', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "network_quality_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text,
	"network_type" text NOT NULL,
	"bandwidth_kbps" integer,
	"latency_ms" integer,
	"packet_loss_pct" real,
	"ws_connected" boolean DEFAULT true NOT NULL,
	"ws_fallback_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "offline_queue_status" DEFAULT 'pending' NOT NULL,
	"priority" "offline_queue_priority" DEFAULT 'normal' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp,
	"last_error" text,
	"synced_at" timestamp,
	"device_id" text,
	"network_type" text,
	"bandwidth_kbps" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retry_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"operation_type" text NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"initial_delay_ms" integer DEFAULT 1000 NOT NULL,
	"backoff_multiplier" real DEFAULT 2 NOT NULL,
	"max_delay_ms" integer DEFAULT 60000 NOT NULL,
	"retry_on_statuses" jsonb DEFAULT '[500,502,503,504]'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "bvn_number" text;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "bvn_match_score" real;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "bvn_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "bvn_verification_status" text;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "document_expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "document_expired" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "liveness_retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "liveness_blocked_until" timestamp;--> statement-breakpoint
CREATE INDEX "network_quality_merchant_idx" ON "network_quality_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "network_quality_created_idx" ON "network_quality_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "offline_queue_merchant_idx" ON "offline_queue" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "offline_queue_status_idx" ON "offline_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offline_queue_priority_idx" ON "offline_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "offline_queue_next_retry_idx" ON "offline_queue" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "offline_queue_created_idx" ON "offline_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "retry_policies_merchant_idx" ON "retry_policies" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "retry_policies_op_idx" ON "retry_policies" USING btree ("operation_type");--> statement-breakpoint
CREATE INDEX "kyc_bvn_status_idx" ON "kyc_submissions" USING btree ("bvn_verification_status");