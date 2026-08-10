ALTER TABLE "merchants" ADD COLUMN "min_liveness_score" real DEFAULT 0.7 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "kyb_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "kyc_auto_approve_threshold" real DEFAULT 0.95 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "aml_screening_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "sanctions_check_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "pep_check_enabled" boolean DEFAULT true NOT NULL;