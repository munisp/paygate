CREATE TYPE "public"."billing_config_status" AS ENUM('draft', 'active', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."overhead_cost_category" AS ENUM('infrastructure', 'labor', 'travel', 'marketing', 'compliance', 'support', 'other');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('per_transaction', 'subscription', 'hybrid');--> statement-breakpoint
CREATE TABLE "billing_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"billing_config_id" text,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"status" "billing_config_status" DEFAULT 'draft' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"pricing_model" "pricing_model" DEFAULT 'per_transaction' NOT NULL,
	"fee_rate" real DEFAULT 0.015 NOT NULL,
	"fee_cap_kobo" bigint DEFAULT 200000 NOT NULL,
	"fee_floor_kobo" bigint DEFAULT 0 NOT NULL,
	"platform_share" real DEFAULT 0.65 NOT NULL,
	"reseller_share" real DEFAULT 0.35 NOT NULL,
	"interchange_cost_kobo" bigint DEFAULT 5000 NOT NULL,
	"sign_on_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"sign_on_platform_share" real DEFAULT 0.7 NOT NULL,
	"subscription_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"subscription_platform_share" real DEFAULT 0.65 NOT NULL,
	"tb_merchant_payable_account" text,
	"tb_platform_revenue_account" text,
	"tb_reseller_payable_account" text,
	"tb_interchange_cost_account" text,
	"tb_sign_on_revenue_account" text,
	"monthly_overhead_cap_kobo" bigint DEFAULT 0,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"reseller_id" text,
	"transaction_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"gross_fee_kobo" bigint NOT NULL,
	"platform_revenue_kobo" bigint NOT NULL,
	"reseller_revenue_kobo" bigint NOT NULL,
	"interchange_cost_kobo" bigint NOT NULL,
	"net_platform_revenue_kobo" bigint NOT NULL,
	"pricing_model" "pricing_model" NOT NULL,
	"channel" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "overhead_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"category" "overhead_cost_category" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"description" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_billing_config_id_billing_configs_id_fk" FOREIGN KEY ("billing_config_id") REFERENCES "public"."billing_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_configs" ADD CONSTRAINT "billing_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_costs" ADD CONSTRAINT "overhead_costs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_audit_tenant_idx" ON "billing_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_audit_actor_idx" ON "billing_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "billing_audit_config_idx" ON "billing_audit_log" USING btree ("billing_config_id");--> statement-breakpoint
CREATE INDEX "billing_config_tenant_idx" ON "billing_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_config_active_idx" ON "billing_configs" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "billing_event_tenant_idx" ON "billing_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_event_merchant_idx" ON "billing_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "billing_event_occurred_idx" ON "billing_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "overhead_tenant_idx" ON "overhead_costs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "overhead_period_idx" ON "overhead_costs" USING btree ("tenant_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "overhead_category_idx" ON "overhead_costs" USING btree ("tenant_id","category");