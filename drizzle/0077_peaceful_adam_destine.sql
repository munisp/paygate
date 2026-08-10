CREATE TABLE "cbdc_accounts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"rail" varchar(16) NOT NULL,
	"wallet_id" varchar(128) NOT NULL,
	"owner_id" varchar(64) NOT NULL,
	"owner_type" varchar(32) NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"currency" varchar(8) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cbdc_transfers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"rail" varchar(16) NOT NULL,
	"sender_wallet" varchar(128) NOT NULL,
	"receiver_wallet" varchar(128) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) NOT NULL,
	"narration" varchar(256),
	"status" varchar(32) DEFAULT 'INITIATED' NOT NULL,
	"rail_ref" varchar(128),
	"tiger_beetle_ref" varchar(128),
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "energy_vend_transactions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"meter_number" varchar(32) NOT NULL,
	"disco" varchar(16) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"customer_phone" varchar(32) NOT NULL,
	"customer_fsp" varchar(64) NOT NULL,
	"customer_account" varchar(64) NOT NULL,
	"token" varchar(24),
	"units" double precision,
	"transfer_ref" varchar(128),
	"disco_ref" varchar(128),
	"status" varchar(32) DEFAULT 'INITIATED' NOT NULL,
	"error_code" varchar(64),
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"vended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "g2p_disbursement_batches" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"program_type" varchar(32) NOT NULL,
	"program_id" varchar(64) NOT NULL,
	"payer_fsp" varchar(64) NOT NULL,
	"payer_account" varchar(64) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"total_amount" double precision NOT NULL,
	"beneficiary_count" integer NOT NULL,
	"disbursed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "healthcare_claims" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"policy_number" varchar(64) NOT NULL,
	"beneficiary_id" varchar(64) NOT NULL,
	"beneficiary_name" varchar(128) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"provider_name" varchar(128) NOT NULL,
	"claim_type" varchar(32) NOT NULL,
	"diagnosis_codes" text DEFAULT '[]' NOT NULL,
	"procedure_codes" text DEFAULT '[]' NOT NULL,
	"claim_amount" double precision NOT NULL,
	"approved_amount" double precision,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"service_date" varchar(16) NOT NULL,
	"status" varchar(32) DEFAULT 'SUBMITTED' NOT NULL,
	"nhia_claim_ref" varchar(128),
	"adjudication_notes" text,
	"submitted_by" varchar(64),
	"submitted_at" timestamp DEFAULT now(),
	"adjudicated_at" timestamp,
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "insurance_premium_payments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"policy_id" varchar(64) NOT NULL,
	"policy_number" varchar(64) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"due_date" varchar(16) NOT NULL,
	"paid_at" timestamp,
	"transfer_ref" varchar(128),
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remittance_corridors" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"from_currency" varchar(8) NOT NULL,
	"to_currency" varchar(8) NOT NULL,
	"from_country" varchar(4) NOT NULL,
	"to_country" varchar(4) NOT NULL,
	"exchange_rate" double precision NOT NULL,
	"fee" double precision DEFAULT 0 NOT NULL,
	"fee_type" varchar(16) DEFAULT 'FLAT' NOT NULL,
	"min_amount" double precision DEFAULT 100 NOT NULL,
	"max_amount" double precision DEFAULT 5000000 NOT NULL,
	"provider" varchar(64) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remittance_transfers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"corridor_id" varchar(64) NOT NULL,
	"sender_fsp" varchar(64) NOT NULL,
	"sender_account" varchar(64) NOT NULL,
	"receiver_fsp" varchar(64) NOT NULL,
	"receiver_account" varchar(64) NOT NULL,
	"send_amount" double precision NOT NULL,
	"send_currency" varchar(8) NOT NULL,
	"receive_amount" double precision,
	"receive_currency" varchar(8),
	"exchange_rate" double precision,
	"fee" double precision,
	"receiver_name" varchar(128) NOT NULL,
	"narration" varchar(256),
	"status" varchar(32) DEFAULT 'INITIATED' NOT NULL,
	"rail_ref" varchar(128),
	"travel_rule_ref" varchar(128),
	"risk_score" integer,
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scf_invoices" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"supplier_id" varchar(64) NOT NULL,
	"supplier_fsp" varchar(64) NOT NULL,
	"supplier_account" varchar(64) NOT NULL,
	"buyer_id" varchar(64) NOT NULL,
	"buyer_fsp" varchar(64) NOT NULL,
	"buyer_account" varchar(64) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"due_date" varchar(16) NOT NULL,
	"discount_rate" double precision,
	"discount_amount" double precision,
	"net_amount" double precision,
	"status" varchar(32) DEFAULT 'SUBMITTED' NOT NULL,
	"transfer_ref" varchar(128),
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "cbdc_acc_rail_idx" ON "cbdc_accounts" USING btree ("rail");--> statement-breakpoint
CREATE INDEX "cbdc_acc_owner_idx" ON "cbdc_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "cbdc_acc_wallet_idx" ON "cbdc_accounts" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "cbdc_tx_rail_idx" ON "cbdc_transfers" USING btree ("rail");--> statement-breakpoint
CREATE INDEX "cbdc_tx_status_idx" ON "cbdc_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "evt_meter_idx" ON "energy_vend_transactions" USING btree ("meter_number");--> statement-breakpoint
CREATE INDEX "evt_disco_idx" ON "energy_vend_transactions" USING btree ("disco");--> statement-breakpoint
CREATE INDEX "evt_status_idx" ON "energy_vend_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "g2p_program_idx" ON "g2p_disbursement_batches" USING btree ("program_type");--> statement-breakpoint
CREATE INDEX "g2p_status_idx" ON "g2p_disbursement_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hc_status_idx" ON "healthcare_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hc_policy_idx" ON "healthcare_claims" USING btree ("policy_number");--> statement-breakpoint
CREATE INDEX "hc_provider_idx" ON "healthcare_claims" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "ipp_policy_idx" ON "insurance_premium_payments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "ipp_status_idx" ON "insurance_premium_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ipp_due_date_idx" ON "insurance_premium_payments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "rc_from_to_idx" ON "remittance_corridors" USING btree ("from_currency","to_currency");--> statement-breakpoint
CREATE INDEX "rc_active_idx" ON "remittance_corridors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "rt_status_idx" ON "remittance_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rt_corridor_idx" ON "remittance_transfers" USING btree ("corridor_id");--> statement-breakpoint
CREATE INDEX "scf_status_idx" ON "scf_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scf_supplier_idx" ON "scf_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "scf_buyer_idx" ON "scf_invoices" USING btree ("buyer_id");