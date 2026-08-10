CREATE TYPE "public"."settlement_freq" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'pending_approval' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "payout_approval_threshold" bigint DEFAULT 500000 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "payout_approval_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "settlement_frequency" "settlement_freq" DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "settlement_min_amount" bigint DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "settlement_bank_code" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "settlement_account_number" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "settlement_account_name" text;