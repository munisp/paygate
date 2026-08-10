CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'sla_breached');--> statement-breakpoint
CREATE TYPE "public"."tenant_plan" AS ENUM('starter', 'growth', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('pending', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TABLE "nip_account_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"session_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nip_banks" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"short_name" text,
	"nip_code" text,
	"category" text DEFAULT 'commercial',
	"is_active" integer DEFAULT 1 NOT NULL,
	"supports_nip" integer DEFAULT 1 NOT NULL,
	"supports_ussd" integer DEFAULT 0 NOT NULL,
	"logo_url" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nip_banks_bank_code_unique" UNIQUE("bank_code")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"reference" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"sla_deadline_at" timestamp,
	"sla_breached_at" timestamp,
	"sla_alert_sent_at" timestamp,
	"workflow_id" text,
	"bridge_ref" text,
	"failure_reason" text,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "tenant_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"card_fees_bps" integer DEFAULT 150 NOT NULL,
	"bank_transfer_fees_bps" integer DEFAULT 50 NOT NULL,
	"mobile_money_fees_bps" integer DEFAULT 100 NOT NULL,
	"cross_border_fees_bps" integer DEFAULT 200 NOT NULL,
	"bnpl_fees_bps" integer DEFAULT 300 NOT NULL,
	"fx_spread_bps" integer DEFAULT 150 NOT NULL,
	"settlement_frequency" "settlement_freq" DEFAULT 'daily' NOT NULL,
	"settlement_cutoff_hour" integer DEFAULT 18 NOT NULL,
	"settlement_min_amount" bigint DEFAULT 10000 NOT NULL,
	"bnpl_max_installments" integer DEFAULT 12 NOT NULL,
	"bnpl_max_loan_amount" bigint DEFAULT 5000000 NOT NULL,
	"bnpl_interest_rate_bps" integer DEFAULT 200 NOT NULL,
	"api_rate_limit_rpm" integer DEFAULT 1000 NOT NULL,
	"payout_approval_threshold" bigint DEFAULT 500000 NOT NULL,
	"payout_approval_enabled" boolean DEFAULT false NOT NULL,
	"settlement_sla_hours" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "tenant_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"plan" "tenant_plan" DEFAULT 'starter' NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"country" text DEFAULT 'NG' NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#6366f1',
	"max_merchants" integer DEFAULT 10 NOT NULL,
	"max_consumers" integer DEFAULT 10000 NOT NULL,
	"max_daily_volume" bigint DEFAULT 100000000 NOT NULL,
	"bnpl_enabled" boolean DEFAULT false NOT NULL,
	"cross_border_enabled" boolean DEFAULT false NOT NULL,
	"virtual_cards_enabled" boolean DEFAULT false NOT NULL,
	"kafka_topic_prefix" text,
	"permify_tenant_id" text,
	"tigerbeetle_ledger_id" bigint,
	"provisioned_by" text,
	"provisioned_at" timestamp,
	"suspended_at" timestamp,
	"suspend_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "cross_border_transfers" DROP CONSTRAINT "cross_border_transfers_transfer_id_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_merchant_email_uniq";--> statement-breakpoint
ALTER TABLE "disputes" DROP CONSTRAINT "disputes_reference_unique";--> statement-breakpoint
ALTER TABLE "payment_links" DROP CONSTRAINT "payment_links_slug_unique";--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_reference_unique";--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_merchant_email_uniq";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_reference_unique";--> statement-breakpoint
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_reference_unique";--> statement-breakpoint
DROP INDEX "idempotency_key_merchant_idx";--> statement-breakpoint
DROP INDEX "wallet_tx_reference_idx";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_requests" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "mobile_money_recon" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "virtual_cards" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "tenant_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "nip_account_cache" ADD CONSTRAINT "nip_account_cache_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_config" ADD CONSTRAINT "tenant_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nip_account_cache_key_idx" ON "nip_account_cache" USING btree ("tenant_id","bank_code","account_number");--> statement-breakpoint
CREATE INDEX "nip_account_cache_expires_idx" ON "nip_account_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nip_banks_code_idx" ON "nip_banks" USING btree ("bank_code");--> statement-breakpoint
CREATE INDEX "nip_banks_active_idx" ON "nip_banks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "settlements_tenant_idx" ON "settlements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "settlements_merchant_idx" ON "settlements" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "settlements_status_idx" ON "settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "settlements_sla_deadline_idx" ON "settlements" USING btree ("sla_deadline_at");--> statement-breakpoint
CREATE INDEX "settlements_reference_idx" ON "settlements" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_recon" ADD CONSTRAINT "mobile_money_recon_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_cards" ADD CONSTRAINT "virtual_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bnpl_tenant_idx" ON "bnpl_loans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "xborder_tenant_idx" ON "cross_border_transfers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_idx" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "disputes_tenant_idx" ON "disputes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fraud_alerts_tenant_idx" ON "fraud_alerts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_tenant_key_merchant_idx" ON "idempotency_requests" USING btree ("id","tenant_id","merchant_id");--> statement-breakpoint
CREATE INDEX "kyc_tenant_idx" ON "kyc_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "merchants_tenant_idx" ON "merchants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mm_recon_tenant_idx" ON "mobile_money_recon" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_links_tenant_idx" ON "payment_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payouts_tenant_idx" ON "payouts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "team_members_tenant_idx" ON "team_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "transactions_tenant_idx" ON "transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "virtual_cards_tenant_idx" ON "virtual_cards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_tenant_idx" ON "wallet_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wallets_tenant_idx" ON "wallets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_tenant_idx" ON "webhook_deliveries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "webhooks_tenant_idx" ON "webhooks" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "xborder_tenant_transfer_uniq" UNIQUE("tenant_id","transfer_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_merchant_email_uniq" UNIQUE("tenant_id","merchant_id","email");--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_tenant_ref_uniq" UNIQUE("tenant_id","reference");--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_slug_uniq" UNIQUE("tenant_id","slug");--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tenant_ref_uniq" UNIQUE("tenant_id","reference");--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_merchant_email_uniq" UNIQUE("tenant_id","merchant_id","email");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_ref_uniq" UNIQUE("tenant_id","reference");--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_tx_tenant_ref_uniq" UNIQUE("tenant_id","reference");