ALTER TABLE "liveness_sessions" ADD COLUMN "retention_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "liveness_sessions" ADD COLUMN "ndpr_purged_at" timestamp;--> statement-breakpoint
CREATE INDEX "liveness_sessions_retention_idx" ON "liveness_sessions" USING btree ("retention_expires_at");