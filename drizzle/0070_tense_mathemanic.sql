ALTER TABLE "kyb_verifications" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "kyb_verifications" ADD COLUMN "renewal_reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "kyb_verifications" ADD COLUMN "last_known_ip" text;--> statement-breakpoint
ALTER TABLE "kyb_verifications" ADD COLUMN "last_known_country" text;--> statement-breakpoint
ALTER TABLE "kyb_verifications" ADD COLUMN "geo_velocity_flagged" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "kyb_verifications" ADD COLUMN "geo_velocity_note" text;--> statement-breakpoint
CREATE INDEX "kyb_expires_idx" ON "kyb_verifications" USING btree ("expires_at");