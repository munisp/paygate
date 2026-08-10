ALTER TABLE "pos_terminals" ADD COLUMN "latitude" integer;--> statement-breakpoint
ALTER TABLE "pos_terminals" ADD COLUMN "longitude" integer;--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD COLUMN "settlement_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD COLUMN "settlement_batch_id" text;--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD COLUMN "nibss_reference" text;--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD COLUMN "settled_at" timestamp;