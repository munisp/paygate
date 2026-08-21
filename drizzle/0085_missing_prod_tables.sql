CREATE TABLE IF NOT EXISTS "kyb_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"business_name" varchar,
	"rc_number" varchar,
	"tax_id" varchar,
	"business_address" text,
	"business_type" varchar,
	"director_name" varchar,
	"director_bvn" varchar,
	"director_nin" varchar,
	"cac_document_url" text,
	"utility_bill_url" text,
	"status" varchar DEFAULT 'submitted' NOT NULL,
	"review_note" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"submitted_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "kyb_applications_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fraud_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"status" varchar DEFAULT 'open',
	"reason" text,
	"amount" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consumer_referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"referral_code" varchar NOT NULL,
	"successful_referrals" integer DEFAULT 0,
	"total_rewards_earned" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "consumer_referrals_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bnpl_delinquency_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" varchar DEFAULT 'active',
	"days_overdue" integer,
	"overdue_amount" numeric,
	"penalty_amount" numeric,
	"collection_status" varchar DEFAULT 'pending',
	"last_contact_date" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fx_auto_hedge_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency_pair" varchar,
	"trigger_threshold" numeric,
	"hedge_percentage" numeric,
	"max_position_size" numeric,
	"is_active" boolean DEFAULT true,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mutual_fund_investments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fund_id" varchar,
	"invested_kobo" bigint,
	"current_value_kobo" bigint,
	"units" double precision,
	"status" varchar DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"redeemed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_feature_flags" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"flag_key" text NOT NULL,
	"enabled" boolean DEFAULT false,
	"rollout_percentage" integer DEFAULT 0,
	"override_reason" text,
	"set_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenant_feature_flags_tenant_flag_unique" UNIQUE("tenant_id","flag_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_webhook_secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"endpoint_url" text,
	"signing_secret" text,
	"algorithm" varchar DEFAULT 'hmac-sha256',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loyalty_promotion_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"old_tier" varchar,
	"new_tier" varchar,
	"points_at_promotion" numeric,
	"promoted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jwt_revocation_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"jti" varchar NOT NULL,
	"user_id" integer,
	"expires_at" timestamp NOT NULL,
	"reason" varchar,
	CONSTRAINT "jwt_revocation_list_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_stripe_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"stripe_payment_method_id" varchar,
	"plan" varchar,
	"billing_email" varchar,
	"billing_cycle_anchor" integer,
	"next_invoice_date" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenant_stripe_customers_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_onboarding_emails" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tenant_id" varchar,
	"email_type" varchar,
	"recipient_email" varchar,
	"subject" varchar,
	"status" varchar,
	"metadata" jsonb,
	"sent_at" timestamp,
	"retry_count" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "middleware_integration_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" varchar,
	"operation" varchar,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"status_code" integer,
	"duration_ms" integer,
	"success" boolean,
	"error_message" text,
	"correlation_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_incidents" (
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar,
	"severity" varchar,
	"description" text,
	"uptime_pct" numeric,
	"latency_ms" integer,
	"status" varchar DEFAULT 'open',
	"acknowledged_at" timestamp,
	"resolved_at" timestamp,
	"auto_resolved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_incident_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_name" varchar,
	"message" text,
	"started_at" timestamp,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_alert_subscriptions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" integer,
	"endpoint" text,
	"p256dh" text,
	"auth" text,
	"severity_threshold" varchar,
	"active" boolean DEFAULT true,
	CONSTRAINT "sla_alert_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grafana_dashboard_configs" (
	"dashboard_uid" varchar PRIMARY KEY NOT NULL,
	"title" varchar,
	"description" text,
	"panel_count" integer,
	"tags" jsonb,
	"is_default" boolean DEFAULT false,
	"config_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_checkout_session_id_unique" ON "orders" USING btree ("checkout_session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consumer_wallet_txns_wallet_reference_unique" ON "consumer_wallet_txns" USING btree ("wallet_id","reference");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consumer_loyalty_txns_reference_id_unique" ON "consumer_loyalty_txns" USING btree ("reference_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consumer_wallets_user_currency_unique" ON "consumer_wallets" USING btree ("user_id","currency");
