CREATE TABLE "aml_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_name" text NOT NULL,
	"rule_category" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"parameters" text NOT NULL,
	"action" text DEFAULT 'FLAG' NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aml_rules_rule_name_unique" UNIQUE("rule_name")
);
--> statement-breakpoint
CREATE TABLE "dfsp_fee_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"fee_type" text NOT NULL,
	"tier_model" text DEFAULT 'flat' NOT NULL,
	"flat_rate_bps" integer,
	"min_fee_kobo" integer,
	"max_fee_kobo" integer,
	"tier_bands" text,
	"volume_discount_bands" text,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"window_id" text,
	"dfsp_id" text NOT NULL,
	"fee_type" text NOT NULL,
	"fee_category" text DEFAULT 'DEBIT' NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"tigerbeetle_transfer_id" text,
	"billed_at" timestamp,
	"invoice_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_dfsps" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"dfsp_type" text DEFAULT 'bank' NOT NULL,
	"country" text DEFAULT 'NG' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"tigerbeetle_position_account_id" text,
	"tigerbeetle_liquidity_account_id" text,
	"liquidity_limit_kobo" bigint DEFAULT 0 NOT NULL,
	"callback_url" text,
	"client_certificate_thumbprint" text,
	"certificate_expires_at" timestamp,
	"onboarded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nexthub_dfsps_dfsp_id_unique" UNIQUE("dfsp_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"billing_period_start" timestamp NOT NULL,
	"billing_period_end" timestamp NOT NULL,
	"total_scheme_fees_kobo" bigint DEFAULT 0 NOT NULL,
	"total_interchange_kobo" bigint DEFAULT 0 NOT NULL,
	"total_fx_markup_kobo" bigint DEFAULT 0 NOT NULL,
	"total_penalties_kobo" bigint DEFAULT 0 NOT NULL,
	"total_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"pdf_url" text,
	"tigerbeetle_invoice_transfer_id" text,
	"issued_at" timestamp,
	"due_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"dfsp_id" text,
	"source_ip" text,
	"description" text NOT NULL,
	"metadata" text,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"payer_fsp_id" text NOT NULL,
	"payee_fsp_id" text NOT NULL,
	"payer_party_id" text NOT NULL,
	"payee_party_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"state" text DEFAULT 'RECEIVED' NOT NULL,
	"ilp_packet" text,
	"condition" text,
	"fulfilment" text,
	"fraud_score" real,
	"scheme_fee_kobo" bigint DEFAULT 0,
	"interchange_fee_kobo" bigint DEFAULT 0,
	"fx_rate" real,
	"tigerbeetle_transfer_id" text,
	"tigerbeetle_fee_id" text,
	"window_id" text,
	"expiration_time" timestamp,
	"error_code" text,
	"error_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"window_id" text NOT NULL,
	"transfer_id" text,
	"dfsp_id" text,
	"break_type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"hub_amount_kobo" bigint,
	"rail_amount_kobo" bigint,
	"discrepancy_amount_kobo" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"description" text,
	"resolution_notes" text,
	"auto_resolve_sla_minutes" integer,
	"resolved_at" timestamp,
	"escalated_at" timestamp,
	"assigned_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_net_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"window_id" text NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"net_position_kobo" bigint DEFAULT 0 NOT NULL,
	"total_debits_kobo" bigint DEFAULT 0 NOT NULL,
	"total_credits_kobo" bigint DEFAULT 0 NOT NULL,
	"transfer_count" integer DEFAULT 0 NOT NULL,
	"tigerbeetle_account_id" text,
	"settlement_instruction" text,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"window_type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"settled_at" timestamp,
	"total_transfers" integer DEFAULT 0 NOT NULL,
	"total_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"settlement_report_url" text,
	"rail_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"initiated_by_dfsp_id" text NOT NULL,
	"responding_dfsp_id" text,
	"dispute_type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"reason" text NOT NULL,
	"evidence" text,
	"resolution" text,
	"resolution_notes" text,
	"penalty_amount_kobo" bigint DEFAULT 0,
	"reversal_transfer_id" text,
	"tigerbeetle_penalty_transfer_id" text,
	"sla_deadline" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlement_net_positions" ADD CONSTRAINT "settlement_net_positions_window_id_settlement_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."settlement_windows"("id") ON DELETE no action ON UPDATE no action;