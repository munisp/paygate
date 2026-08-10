CREATE TYPE "public"."bnpl_repayment_status" AS ENUM('pending', 'paid', 'overdue', 'waived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invite_code_type" AS ENUM('merchant', 'partner', 'admin', 'consumer', 'team_member');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('invite_code', 'company_info', 'branding', 'fee_structure', 'review', 'completed');--> statement-breakpoint
CREATE TYPE "public"."sso_protocol_enum" AS ENUM('saml', 'oidc', 'oauth2');--> statement-breakpoint
CREATE TYPE "public"."stripe_sub_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'paused');--> statement-breakpoint
CREATE TYPE "public"."tenant_invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TABLE "bnpl_repayment_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"bnpl_loan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"instalment_number" integer NOT NULL,
	"total_instalments" integer NOT NULL,
	"principal_amount_ngn" real NOT NULL,
	"interest_amount_ngn" real DEFAULT 0 NOT NULL,
	"total_due_ngn" real NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"paid_amount_ngn" real,
	"status" "bnpl_repayment_status" DEFAULT 'pending' NOT NULL,
	"late_fee_ngn" real DEFAULT 0 NOT NULL,
	"payment_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "invite_code_type" DEFAULT 'merchant' NOT NULL,
	"uses_remaining" integer DEFAULT 1 NOT NULL,
	"uses_total" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp,
	"created_by" text NOT NULL,
	"tenant_id" text,
	"metadata" text,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "partner_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_code" text,
	"user_id" text,
	"current_step" "onboarding_step" DEFAULT 'invite_code' NOT NULL,
	"company_name" text,
	"company_email" text,
	"company_phone" text,
	"company_address" text,
	"company_rc_number" text,
	"branding_primary_color" text DEFAULT '#1a56db',
	"branding_secondary_color" text DEFAULT '#7e3af2',
	"branding_logo_url" text,
	"branding_favicon_url" text,
	"branding_font_family" text DEFAULT 'Inter',
	"fee_structure" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" "stripe_sub_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_billing_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"period" text NOT NULL,
	"amount_usd" real DEFAULT 0 NOT NULL,
	"status" "tenant_invoice_status" DEFAULT 'open' NOT NULL,
	"stripe_invoice_id" text,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp,
	"due_date" timestamp,
	"line_items" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_corridor_daily_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"corridor_id" text NOT NULL,
	"date" text NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"volume_usd" real DEFAULT 0 NOT NULL,
	"fees_collected_usd" real DEFAULT 0 NOT NULL,
	"avg_fx_rate" real,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_corridors" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_currency" text NOT NULL,
	"dest_currency" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"fx_markup_pct" real DEFAULT 1.5 NOT NULL,
	"daily_limit_usd" real DEFAULT 50000 NOT NULL,
	"min_amount_usd" real DEFAULT 1 NOT NULL,
	"max_amount_usd" real DEFAULT 10000 NOT NULL,
	"flat_fee_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_fee_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"flat_fee_ngn" real DEFAULT 0 NOT NULL,
	"percentage_fee" real DEFAULT 1.5 NOT NULL,
	"cap_ngn" real,
	"floor_ngn" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_plan_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"max_api_calls_per_month" integer DEFAULT 10000 NOT NULL,
	"max_tx_volume_usd_per_month" real DEFAULT 100000 NOT NULL,
	"max_users" integer DEFAULT 5 NOT NULL,
	"max_corridors" integer DEFAULT 3 NOT NULL,
	"max_webhooks" integer DEFAULT 5 NOT NULL,
	"max_api_keys" integer DEFAULT 3 NOT NULL,
	"price_usd_per_month" real DEFAULT 0 NOT NULL,
	"stripe_price_id" text,
	"features" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_plan_limits_plan_unique" UNIQUE("plan")
);
--> statement-breakpoint
CREATE TABLE "tenant_sso_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"protocol" "sso_protocol_enum" DEFAULT 'oidc' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"entity_id" text,
	"sso_url" text,
	"slo_url" text,
	"certificate" text,
	"client_id" text,
	"client_secret" text,
	"discovery_url" text,
	"scopes" text DEFAULT 'openid email profile',
	"attribute_mapping" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_sso_configs_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_usage_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"period" text NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"tx_volume" real DEFAULT 0 NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"storage_bytes" integer DEFAULT 0 NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"webhook_deliveries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bnpl_repay_loan_idx" ON "bnpl_repayment_schedules" USING btree ("bnpl_loan_id");--> statement-breakpoint
CREATE INDEX "bnpl_repay_user_idx" ON "bnpl_repayment_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bnpl_repay_due_idx" ON "bnpl_repayment_schedules" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "bnpl_repay_status_idx" ON "bnpl_repayment_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invite_code_code_idx" ON "invite_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invite_code_type_idx" ON "invite_codes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "invite_code_tenant_idx" ON "invite_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "partner_onboard_user_idx" ON "partner_onboarding_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "partner_onboard_step_idx" ON "partner_onboarding_sessions" USING btree ("current_step");--> statement-breakpoint
CREATE INDEX "stripe_sub_user_idx" ON "stripe_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_stripe_id_idx" ON "stripe_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_status_idx" ON "stripe_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenant_invoice_tenant_idx" ON "tenant_billing_invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_invoice_status_idx" ON "tenant_billing_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenant_invoice_period_idx" ON "tenant_billing_invoices" USING btree ("period");--> statement-breakpoint
CREATE INDEX "corridor_daily_tenant_idx" ON "tenant_corridor_daily_stats" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "corridor_daily_date_idx" ON "tenant_corridor_daily_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "corridor_daily_corridor_idx" ON "tenant_corridor_daily_stats" USING btree ("corridor_id");--> statement-breakpoint
CREATE INDEX "tenant_corridor_tenant_idx" ON "tenant_corridors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_corridor_currencies_idx" ON "tenant_corridors" USING btree ("source_currency","dest_currency");--> statement-breakpoint
CREATE INDEX "tenant_fee_tenant_idx" ON "tenant_fee_overrides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_fee_type_idx" ON "tenant_fee_overrides" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "tenant_plan_limits_plan_idx" ON "tenant_plan_limits" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "tenant_sso_tenant_idx" ON "tenant_sso_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_usage_tenant_period_idx" ON "tenant_usage_metrics" USING btree ("tenant_id","period");