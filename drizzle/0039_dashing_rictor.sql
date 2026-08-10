ALTER TABLE "kyc_submissions" ADD COLUMN "liveness_override" boolean;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "liveness_override_note" text;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "liveness_override_by" text;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "liveness_override_at" timestamp;