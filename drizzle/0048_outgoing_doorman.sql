ALTER TABLE "customers" ADD COLUMN "plan_id" text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD COLUMN "fraud_ring_id" text;