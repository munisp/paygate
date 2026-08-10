CREATE TABLE "adverse_media_screenings" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"query" text NOT NULL,
	"provider" text DEFAULT 'llm_search',
	"result" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_risk_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"composite_score" real NOT NULL,
	"risk_band" text NOT NULL,
	"ubo_risk_score" real,
	"adverse_media_score" real,
	"geo_velocity_score" real,
	"document_quality_score" real,
	"liveness_score" real,
	"bvn_match_score" real,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	"scored_by" text DEFAULT 'auto',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporal_consistency_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"check_type" text NOT NULL,
	"field_a" text,
	"field_b" text,
	"passed" boolean NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ubo_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"full_name" text NOT NULL,
	"bvn" text,
	"nin" text,
	"ownership_pct" real NOT NULL,
	"is_pep" boolean DEFAULT false NOT NULL,
	"kyc_status" text DEFAULT 'pending',
	"kyc_submission_id" text,
	"adverse_media_flagged" boolean DEFAULT false,
	"adverse_media_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "adverse_media_entity_idx" ON "adverse_media_screenings" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "adverse_media_merchant_idx" ON "adverse_media_screenings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "adverse_media_flagged_idx" ON "adverse_media_screenings" USING btree ("flagged");--> statement-breakpoint
CREATE INDEX "kyb_risk_verification_idx" ON "kyb_risk_scores" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "kyb_risk_merchant_idx" ON "kyb_risk_scores" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "kyb_risk_band_idx" ON "kyb_risk_scores" USING btree ("risk_band");--> statement-breakpoint
CREATE INDEX "temporal_submission_idx" ON "temporal_consistency_checks" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "temporal_merchant_idx" ON "temporal_consistency_checks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "temporal_check_type_idx" ON "temporal_consistency_checks" USING btree ("check_type");--> statement-breakpoint
CREATE INDEX "ubo_verification_idx" ON "ubo_owners" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "ubo_merchant_idx" ON "ubo_owners" USING btree ("merchant_id");