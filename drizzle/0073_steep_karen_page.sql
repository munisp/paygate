ALTER TABLE "kyc_submissions" ADD COLUMN "face_match_verified" boolean;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "face_match_score" real;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "face_match_distance" real;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "face_match_model" text;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "face_match_at" timestamp;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "estimated_age" integer;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "age_estimation_flag" text;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "face_embedding" jsonb;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "duplicate_check_at" timestamp;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "duplicate_flag" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "duplicate_of_submission_id" text;--> statement-breakpoint
CREATE INDEX "kyc_face_match_idx" ON "kyc_submissions" USING btree ("face_match_verified");--> statement-breakpoint
CREATE INDEX "kyc_duplicate_idx" ON "kyc_submissions" USING btree ("duplicate_flag");