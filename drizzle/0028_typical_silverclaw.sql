CREATE TABLE "merchant_solana_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"label" text DEFAULT 'default',
	"network" text DEFAULT 'mainnet' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usdc_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"merchant_id" text,
	"amount_lamports" bigint NOT NULL,
	"solana_signature" text NOT NULL,
	"solana_slot" bigint,
	"network" text DEFAULT 'mainnet' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "usdc_deposits_solana_signature_unique" UNIQUE("solana_signature")
);
--> statement-breakpoint
CREATE TABLE "usdc_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"recipient_wallet" text NOT NULL,
	"amount_lamports" bigint NOT NULL,
	"tb_pending_transfer_id" text,
	"tb_posted_transfer_id" text,
	"solana_signature" text,
	"solana_slot" bigint,
	"temporal_workflow_id" text,
	"temporal_run_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"fraud_score" integer,
	"fraud_signals" text[],
	"reference" text,
	"network" text DEFAULT 'mainnet' NOT NULL,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "msw_merchant_idx" ON "merchant_solana_wallets" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "msw_address_idx" ON "merchant_solana_wallets" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "ud_wallet_idx" ON "usdc_deposits" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "ud_merchant_idx" ON "usdc_deposits" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ud_signature_idx" ON "usdc_deposits" USING btree ("solana_signature");--> statement-breakpoint
CREATE INDEX "up_merchant_idx" ON "usdc_payouts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "up_status_idx" ON "usdc_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "up_signature_idx" ON "usdc_payouts" USING btree ("solana_signature");--> statement-breakpoint
CREATE INDEX "up_workflow_idx" ON "usdc_payouts" USING btree ("temporal_workflow_id");