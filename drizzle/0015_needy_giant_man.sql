CREATE TYPE "public"."pos_terminal_model" AS ENUM('soundbox_basic', 'pos_lite', 'pos_smart', 'ussd_terminal');--> statement-breakpoint
CREATE TYPE "public"."pos_terminal_status" AS ENUM('active', 'inactive', 'maintenance', 'stolen');--> statement-breakpoint
CREATE TYPE "public"."subscription_interval" AS ENUM('daily', 'weekly', 'monthly', 'quarterly', 'annually');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "pos_terminals" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"serial_number" text NOT NULL,
	"model" "pos_terminal_model" DEFAULT 'soundbox_basic' NOT NULL,
	"label" text,
	"location" text,
	"status" "pos_terminal_status" DEFAULT 'active' NOT NULL,
	"last_heartbeat_at" timestamp,
	"firmware_version" text,
	"ip_address" text,
	"audio_alerts_enabled" boolean DEFAULT true NOT NULL,
	"audio_language" text DEFAULT 'en' NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_volume_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pos_terminals_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "pos_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"terminal_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"channel" text DEFAULT 'qr' NOT NULL,
	"masked_pan" text,
	"nip_session_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"receipt_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"nip_session_id" text,
	"failure_reason" text,
	"charged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_email" text,
	"customer_name" text,
	"customer_phone" text,
	"plan_name" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"interval" "subscription_interval" DEFAULT 'monthly' NOT NULL,
	"total_cycles" integer,
	"completed_cycles" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"failure_reason" text,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_terminal_id_pos_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."pos_terminals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_merchant_idx" ON "pos_terminals" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pos_status_idx" ON "pos_terminals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pos_serial_idx" ON "pos_terminals" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "pos_tx_terminal_idx" ON "pos_transactions" USING btree ("terminal_id");--> statement-breakpoint
CREATE INDEX "pos_tx_merchant_idx" ON "pos_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sub_charges_sub_idx" ON "subscription_charges" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "sub_charges_merchant_idx" ON "subscription_charges" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_merchant_idx" ON "subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_next_run_idx" ON "subscriptions" USING btree ("next_run_at");