CREATE TABLE "alert_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_open_id" text NOT NULL,
	"lag_warn" integer DEFAULT 5 NOT NULL,
	"lag_critical" integer DEFAULT 20 NOT NULL,
	"mem_warn_pct" integer DEFAULT 70 NOT NULL,
	"mem_critical_pct" integer DEFAULT 85 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alert_thresholds_owner_open_id_unique" UNIQUE("owner_open_id")
);
--> statement-breakpoint
CREATE TABLE "breach_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"value" double precision NOT NULL,
	"threshold" double precision NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mobile_money_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"currency" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"supports_collection" boolean DEFAULT true NOT NULL,
	"supports_disbursement" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_money_providers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "mobile_money_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text,
	"provider_code" text NOT NULL,
	"type" text NOT NULL,
	"reference" text NOT NULL,
	"external_reference" text,
	"customer_msisdn" text,
	"customer_name" text,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ussd_code" text,
	"payment_prompt_sent_at" timestamp,
	"expires_at" timestamp,
	"completed_at" timestamp,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_money_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "named_alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"metric" text NOT NULL,
	"target" text NOT NULL,
	"severity" text DEFAULT 'warn' NOT NULL,
	"threshold" double precision NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"terminal_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"reference" text NOT NULL,
	"type" text NOT NULL,
	"payment_method" text,
	"card_brand" text,
	"card_last4" text,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "terminal_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "terminals" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text,
	"serial_number" text NOT NULL,
	"model" text,
	"label" text,
	"location" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"firmware_version" text,
	"ip_address" text,
	"last_heartbeat_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "terminals_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
ALTER TABLE "kyb_verifications" ADD COLUMN "temporal_workflow_id" text;--> statement-breakpoint
ALTER TABLE "kyb_verifications" ADD COLUMN "temporal_run_id" text;--> statement-breakpoint
CREATE INDEX "breach_events_detected_idx" ON "breach_events" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "breach_events_ack_idx" ON "breach_events" USING btree ("acknowledged");--> statement-breakpoint
CREATE INDEX "mm_txn_merchant_idx" ON "mobile_money_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mm_txn_status_idx" ON "mobile_money_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "terminal_txn_terminal_idx" ON "terminal_transactions" USING btree ("terminal_id");--> statement-breakpoint
CREATE INDEX "terminal_txn_merchant_idx" ON "terminal_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "terminals_merchant_idx" ON "terminals" USING btree ("merchant_id");