CREATE TABLE "kyb_state_transitions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"merchant_id" integer,
	"from_state" text,
	"to_state" text,
	"trigger_event" text,
	"actor_id" integer,
	"actor" text,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"service_name" text NOT NULL,
	"metric_date" date,
	"uptime_pct" numeric,
	"avg_latency_ms" integer,
	"p99_latency_ms" integer,
	"error_rate_pct" numeric,
	"incident_count" integer DEFAULT 0,
	"status" text,
	"response_time_ms" integer,
	"message" text,
	"recorded_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sla_metrics_tenant_service_date_unique" UNIQUE("tenant_id","service_name","metric_date")
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"total_amount_kobo" bigint,
	"total_amount" numeric,
	"payout_count" integer,
	"count" integer,
	"currency" text DEFAULT 'NGN',
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"approver_note" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_hedge_positions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"reference" text,
	"position_id" text,
	"merchant_id" text,
	"base_currency" text,
	"quote_currency" text,
	"currency_pair" text,
	"notional_amount" numeric,
	"hedge_amount" numeric,
	"hedge_rate" numeric,
	"expiry_date" text,
	"hedge_type" text,
	"direction" text DEFAULT 'buy',
	"status" text DEFAULT 'active',
	"opened_by" integer,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bnpl_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"consumer_id" text NOT NULL,
	"user_id" text,
	"plan_id" text,
	"requested_limit" numeric,
	"approved_limit" numeric,
	"requested_amount" numeric,
	"purpose" text,
	"currency" text DEFAULT 'NGN',
	"monthly_income" numeric,
	"employment_status" text,
	"bvn" text,
	"score" numeric,
	"credit_score" numeric,
	"status" text DEFAULT 'pending',
	"decision_reason" text,
	"repayment_months" integer,
	"interest_rate" numeric,
	"principal_amount" numeric,
	"term_months" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bnpl_applications_consumer_id_unique" UNIQUE("consumer_id")
);
--> statement-breakpoint
CREATE TABLE "flag_exposure_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"flag_key" text NOT NULL,
	"user_id" text,
	"tenant_id" text,
	"variant" text DEFAULT 'control',
	"converted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ussd_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_code" text NOT NULL,
	"title" text NOT NULL,
	"parent_id" integer,
	"action_type" text,
	"action_payload" jsonb,
	"options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_api_keys" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text,
	"key_prefix" text,
	"key_hash" text,
	"permissions" integer DEFAULT 1 NOT NULL,
	"scopes" text[],
	"environment" text DEFAULT 'production',
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_approval_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"payout_id" text,
	"merchant_id" text,
	"workflow_step" text,
	"approver_email" text,
	"approver_id" integer,
	"requested_by" text,
	"amount" numeric,
	"amount_kobo" bigint,
	"currency" text DEFAULT 'NGN',
	"risk_score" numeric,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"notes" text,
	"approval_notes" text,
	"rejection_reason" text,
	"approved_by" integer,
	"rejected_by" integer,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "middleware_health_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text,
	"service_name" text,
	"alert_type" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"message" text,
	"error_rate" numeric,
	"latency_p99_ms" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"acknowledged_by" integer,
	"acknowledged_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_tier_configs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tier_name" text NOT NULL,
	"min_points" integer DEFAULT 0 NOT NULL,
	"max_points" integer,
	"cashback_rate" numeric DEFAULT 0.5 NOT NULL,
	"bonus_multiplier" numeric DEFAULT 1.0 NOT NULL,
	"perks_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_tier_configs_tier_name_unique" UNIQUE("tier_name")
);
--> statement-breakpoint
CREATE TABLE "dispute_sla_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispute_id" text,
	"sla_type" text,
	"target_hours" integer DEFAULT 72,
	"started_at" timestamp DEFAULT now(),
	"deadline_at" timestamp,
	"completed_at" timestamp,
	"breached" boolean DEFAULT false NOT NULL,
	"breach_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_cron_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_type" text,
	"tenant_id" integer,
	"status" text DEFAULT 'running' NOT NULL,
	"tenants_processed" integer DEFAULT 0,
	"invoices_generated" integer DEFAULT 0,
	"total_amount" numeric DEFAULT 0,
	"errors" integer DEFAULT 0,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_limits" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"plan" text NOT NULL,
	"plan_id" text,
	"name" text,
	"max_api_calls_per_month" integer DEFAULT 0 NOT NULL,
	"max_tx_volume_usd_per_month" bigint DEFAULT 0 NOT NULL,
	"max_users" integer DEFAULT 0 NOT NULL,
	"max_corridors" integer DEFAULT 0 NOT NULL,
	"max_webhooks" integer DEFAULT 0 NOT NULL,
	"max_api_keys" integer DEFAULT 0 NOT NULL,
	"price_usd_per_month" numeric DEFAULT 0 NOT NULL,
	"price_kobo" bigint,
	"gnn_threshold_kobo" bigint,
	"features" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_limits_plan_unique" UNIQUE("plan")
);
--> statement-breakpoint
CREATE TABLE "webhook_failure_alerts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"merchant_id" text,
	"webhook_id" text,
	"failure_count" integer DEFAULT 0,
	"last_error" text,
	"last_attempted_at" timestamp,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "middleware_health_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"service" text NOT NULL,
	"status" text DEFAULT 'up' NOT NULL,
	"latency_ms" integer DEFAULT 0,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_live_rates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"pair" text NOT NULL,
	"rate" numeric NOT NULL,
	"source" text,
	"fetched_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bnpl_delinquency_cases" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"loan_id" text,
	"user_id" text,
	"overdue_amount" numeric DEFAULT 0,
	"days_overdue" integer DEFAULT 0,
	"collection_status" text DEFAULT 'active',
	"severity" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Align bnpl_repayment_schedules with the columns the wave28/29 production
-- routers actually read/write (application_id + numeric amount columns).
ALTER TABLE "bnpl_repayment_schedules" ADD COLUMN IF NOT EXISTS "application_id" integer;
--> statement-breakpoint
ALTER TABLE "bnpl_repayment_schedules" ADD COLUMN IF NOT EXISTS "principal_amount" numeric;
--> statement-breakpoint
ALTER TABLE "bnpl_repayment_schedules" ADD COLUMN IF NOT EXISTS "interest_amount" numeric;
--> statement-breakpoint
ALTER TABLE "bnpl_repayment_schedules" ADD COLUMN IF NOT EXISTS "total_amount" numeric;
--> statement-breakpoint
ALTER TABLE "bnpl_repayment_schedules" ADD COLUMN IF NOT EXISTS "outstanding_balance" numeric;
--> statement-breakpoint
ALTER TABLE "bnpl_repayment_schedules" ADD COLUMN IF NOT EXISTS "amount_paid" numeric;
--> statement-breakpoint
-- invite_codes.id needs a DB-side default: prod seed scripts and tests insert
-- without an explicit id.
ALTER TABLE "invite_codes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
