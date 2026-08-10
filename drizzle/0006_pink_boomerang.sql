ALTER TABLE "merchants" ADD COLUMN "notify_on_fraud_alert" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "notify_on_payout" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "notify_on_dispute" boolean DEFAULT true NOT NULL;