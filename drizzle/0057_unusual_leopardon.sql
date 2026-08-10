ALTER TABLE "feature_flags" ADD COLUMN "targeting_rules" jsonb;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD COLUMN "tenant_id" text;--> statement-breakpoint
CREATE INDEX "feature_flags_tenant_idx" ON "feature_flags" USING btree ("tenant_id");