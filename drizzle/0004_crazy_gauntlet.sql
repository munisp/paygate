CREATE TABLE "cross_border_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"wallet_id" integer,
	"transfer_id" text NOT NULL,
	"quote_id" text,
	"source_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"source_amount" text NOT NULL,
	"target_amount" text NOT NULL,
	"exchange_rate" text NOT NULL,
	"fee" text DEFAULT '0' NOT NULL,
	"corridor" text NOT NULL,
	"rail" text DEFAULT 'mojaloop' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sender_name" text,
	"sender_account" text,
	"receiver_name" text,
	"receiver_account" text,
	"receiver_fsp_id" text,
	"error_code" text,
	"error_description" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cross_border_transfers_transfer_id_unique" UNIQUE("transfer_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance_before" text NOT NULL,
	"balance_after" text NOT NULL,
	"description" text NOT NULL,
	"reference" text NOT NULL,
	"channel" text NOT NULL,
	"counterparty_id" text,
	"counterparty_name" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"merchant_id" text,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"ledger_balance" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tier" text DEFAULT 'basic' NOT NULL,
	"daily_limit" text DEFAULT '50000' NOT NULL,
	"monthly_limit" text DEFAULT '500000' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "xborder_merchant_idx" ON "cross_border_transfers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "xborder_status_idx" ON "cross_border_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "xborder_rail_idx" ON "cross_border_transfers" USING btree ("rail");--> statement-breakpoint
CREATE INDEX "xborder_created_idx" ON "cross_border_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_tx_wallet_idx" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_reference_idx" ON "wallet_transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "wallet_tx_created_idx" ON "wallet_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallets_merchant_idx" ON "wallets" USING btree ("merchant_id");