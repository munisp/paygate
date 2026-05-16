CREATE TYPE "public"."liveness_decision" AS ENUM('real', 'spoof', 'uncertain');--> statement-breakpoint
CREATE TABLE "liveness_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"submission_id" text,
	"session_ref" text,
	"mode" text DEFAULT 'passive' NOT NULL,
	"challenge_type" text,
	"decision" "liveness_decision",
	"liveness_score" real,
	"confidence_score" real,
	"spoof_type" text,
	"rust_signal_score" real,
	"go_gateway_score" real,
	"python_ml_score" real,
	"ensemble_weights" jsonb,
	"frame_count" integer DEFAULT 0 NOT NULL,
	"passive_frame_url" text,
	"challenge_frame_urls" jsonb,
	"override_decision" "liveness_decision",
	"override_note" text,
	"override_by" text,
	"override_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"device_type" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liveness_sessions" ADD CONSTRAINT "liveness_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liveness_sessions" ADD CONSTRAINT "liveness_sessions_submission_id_kyc_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."kyc_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "liveness_sessions_merchant_idx" ON "liveness_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "liveness_sessions_submission_idx" ON "liveness_sessions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "liveness_sessions_decision_idx" ON "liveness_sessions" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "liveness_sessions_created_idx" ON "liveness_sessions" USING btree ("created_at");