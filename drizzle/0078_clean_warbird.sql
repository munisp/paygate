CREATE TABLE "cost_centres" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"domain" text,
	"budget_amount" double precision,
	"spent_amount" double precision DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "developer_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"environment" text DEFAULT 'test' NOT NULL,
	"scopes" text DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "developer_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text,
	"payload" text NOT NULL,
	"response_status" integer,
	"response_body" text,
	"duration_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"next_retry_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "developer_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"events" text DEFAULT '[]' NOT NULL,
	"signing_secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"retry_policy" text DEFAULT 'exponential' NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_health_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"tps" double precision DEFAULT 0 NOT NULL,
	"error_rate" double precision DEFAULT 0 NOT NULL,
	"p50_latency_ms" integer DEFAULT 0 NOT NULL,
	"p95_latency_ms" integer DEFAULT 0 NOT NULL,
	"p99_latency_ms" integer DEFAULT 0 NOT NULL,
	"uptime" double precision DEFAULT 100 NOT NULL,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"queue_depth" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"snapshot_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_beneficiary_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"full_name" text NOT NULL,
	"nin" text,
	"bvn" text,
	"phone" text,
	"email" text,
	"bank_account" text,
	"bank_code" text,
	"domains" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_domain_quotas" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"domain" text NOT NULL,
	"daily_limit" integer DEFAULT 10000 NOT NULL,
	"monthly_limit" integer DEFAULT 250000 NOT NULL,
	"current_daily" integer DEFAULT 0 NOT NULL,
	"current_monthly" integer DEFAULT 0 NOT NULL,
	"rate_limit_rpm" integer DEFAULT 120 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reset_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_liquidity_windows" (
	"window_id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"amount" bigint NOT NULL,
	"opened_at" timestamp DEFAULT now(),
	"closes_at" timestamp NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_participant_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"net_debit_cap" bigint NOT NULL,
	"liquidity_cover" bigint DEFAULT 0 NOT NULL,
	"position_limit" bigint,
	"alert_threshold" double precision DEFAULT 0.8 NOT NULL,
	"suspend_on_breach" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "nexthub_participant_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"current_value" bigint DEFAULT 0 NOT NULL,
	"reserved_value" bigint DEFAULT 0 NOT NULL,
	"available_value" bigint DEFAULT 0 NOT NULL,
	"ndc_utilisation" double precision DEFAULT 0 NOT NULL,
	"position_status" text DEFAULT 'OK' NOT NULL,
	"last_transfer_id" text,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dfsp_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"scheme_type" text DEFAULT 'FSPIOP' NOT NULL,
	"endpoint_url" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_participants_dfsp_id_unique" UNIQUE("dfsp_id")
);
--> statement-breakpoint
CREATE TABLE "saga_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"saga_type" text NOT NULL,
	"merchant_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"duration_ms" integer,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
