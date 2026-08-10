CREATE TABLE "bulk_payment_schedules" (
	"schedule_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"schedule_name" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending',
	"processed_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbon_credits" (
	"credit_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"project_name" text NOT NULL,
	"tonnes" text NOT NULL,
	"price_per_tonne_kobo" bigint NOT NULL,
	"total_kobo" bigint NOT NULL,
	"vintage" text,
	"standard" text,
	"status" text DEFAULT 'pending',
	"retired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_reports" (
	"report_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"verification_id" text,
	"report_type" text NOT NULL,
	"status" text DEFAULT 'pending',
	"risk_level" text,
	"findings" text,
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_finance_loans" (
	"loan_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"outstanding_kobo" bigint NOT NULL,
	"status" text DEFAULT 'pending',
	"term_days" integer DEFAULT 30,
	"rate_annual_pct" text DEFAULT '0',
	"due_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dcc_transactions" (
	"conversion_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"original_amount_kobo" bigint NOT NULL,
	"converted_amount_kobo" bigint NOT NULL,
	"mid_rate" text NOT NULL,
	"customer_rate" text NOT NULL,
	"margin_pct" text NOT NULL,
	"transfer_id" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_contracts" (
	"escrow_id" text PRIMARY KEY NOT NULL,
	"buyer_merchant_id" text NOT NULL,
	"seller_merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN',
	"conditions" jsonb,
	"status" text DEFAULT 'funded',
	"released_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"policy_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"merchant_id" text,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"provider" text NOT NULL,
	"premium_kobo" bigint NOT NULL,
	"coverage_type" text NOT NULL,
	"status" text DEFAULT 'active',
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"method" text,
	"reference" text,
	"paid_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"invoice_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"customer_email" text,
	"customer_name" text,
	"line_items" jsonb NOT NULL,
	"subtotal_kobo" bigint NOT NULL,
	"tax_kobo" bigint DEFAULT 0,
	"total_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN',
	"status" text DEFAULT 'draft',
	"due_date" text,
	"paid_at" timestamp,
	"payment_link_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"step_name" text NOT NULL,
	"status" text DEFAULT 'pending',
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_verifications" (
	"verification_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"business_name" text NOT NULL,
	"rc_number" text,
	"tax_id" text,
	"business_type" text,
	"industry_code" text,
	"status" text DEFAULT 'pending',
	"risk_level" text,
	"initiated_by" text,
	"started_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_instalments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"due_date" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"paid_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'pending',
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"transfer_id" text,
	"method" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_directors" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"full_name" text NOT NULL,
	"bvn" text,
	"nin" text,
	"date_of_birth" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_loans" (
	"loan_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"status" text DEFAULT 'pending_review',
	"requested_kobo" bigint NOT NULL,
	"approved_kobo" bigint DEFAULT 0,
	"amount_kobo" bigint DEFAULT 0,
	"outstanding_kobo" bigint DEFAULT 0,
	"credit_score" integer DEFAULT 0,
	"risk_band" text,
	"rate_annual_pct" text DEFAULT '0',
	"term_days" integer DEFAULT 90,
	"purpose_code" text,
	"notes" text,
	"due_date" text,
	"disbursed_at" timestamp,
	"transfer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_profiles" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"rc_number" text,
	"tax_id" text,
	"address" text,
	"state" text,
	"country" text DEFAULT 'NG',
	"kyc_status" text DEFAULT 'pending',
	"kyb_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_badges" (
	"badge_id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"recipient_type" text DEFAULT 'merchant',
	"badge_type" text NOT NULL,
	"badge_name" text NOT NULL,
	"metadata" jsonb,
	"mint_tx_hash" text,
	"network" text DEFAULT 'solana',
	"status" text DEFAULT 'minting',
	"minted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_sandbox_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"sandbox_type" text NOT NULL,
	"config" jsonb,
	"is_active" integer DEFAULT 1,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdk_tokens" (
	"token_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scopes" jsonb,
	"is_revoked" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_payments" (
	"split_payment_id" text PRIMARY KEY NOT NULL,
	"split_rule_id" text NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"reference" text,
	"legs" jsonb NOT NULL,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_rules" (
	"rule_id" text PRIMARY KEY NOT NULL,
	"rule_name" text NOT NULL,
	"description" text,
	"recipients" jsonb NOT NULL,
	"created_by" text,
	"is_active" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_withholding_records" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"gross_amount_kobo" bigint NOT NULL,
	"tax_amount_kobo" bigint DEFAULT 0,
	"net_amount_kobo" bigint NOT NULL,
	"tax_type" text DEFAULT 'WHT',
	"tax_rate_pct" text NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'pending',
	"remitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_log" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"status_code" integer,
	"success" integer DEFAULT 0,
	"attempt" integer DEFAULT 1,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb,
	"is_active" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bps_merchant_idx" ON "bulk_payment_schedules" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "bps_status_idx" ON "bulk_payment_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bps_scheduled_idx" ON "bulk_payment_schedules" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "cc_merchant_idx" ON "carbon_credits" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cc_status_idx" ON "carbon_credits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cr_merchant_idx" ON "compliance_reports" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cr_status_idx" ON "compliance_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cfl_customer_idx" ON "consumer_finance_loans" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cfl_merchant_idx" ON "consumer_finance_loans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cfl_status_idx" ON "consumer_finance_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dcc_merchant_idx" ON "dcc_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "dcc_status_idx" ON "dcc_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ec_buyer_idx" ON "escrow_contracts" USING btree ("buyer_merchant_id");--> statement-breakpoint
CREATE INDEX "ec_seller_idx" ON "escrow_contracts" USING btree ("seller_merchant_id");--> statement-breakpoint
CREATE INDEX "ec_status_idx" ON "escrow_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ins_customer_idx" ON "insurance_policies" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ins_status_idx" ON "insurance_policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ip_invoice_idx" ON "invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "inv_merchant_idx" ON "invoices" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "inv_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kybs_verification_idx" ON "kyb_steps" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "kyb_merchant_idx" ON "kyb_verifications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "kyb_status_idx" ON "kyb_verifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "li_loan_idx" ON "loan_instalments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "li_merchant_idx" ON "loan_instalments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "lr_loan_idx" ON "loan_repayments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "md_merchant_idx" ON "merchant_directors" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ml_merchant_idx" ON "merchant_loans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ml_status_idx" ON "merchant_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mp_merchant_idx" ON "merchant_profiles" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nb_recipient_idx" ON "nft_badges" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "nb_status_idx" ON "nft_badges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rsc_merchant_idx" ON "regulatory_sandbox_configs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "st_merchant_idx" ON "sdk_tokens" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "st_hash_idx" ON "sdk_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sp_rule_idx" ON "split_payments" USING btree ("split_rule_id");--> statement-breakpoint
CREATE INDEX "sp_status_idx" ON "split_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sr_active_idx" ON "split_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "twr_merchant_idx" ON "tax_withholding_records" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "twr_period_idx" ON "tax_withholding_records" USING btree ("period");--> statement-breakpoint
CREATE INDEX "wdl_endpoint_idx" ON "webhook_delivery_log" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "wdl_merchant_idx" ON "webhook_delivery_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "we_merchant_idx" ON "webhook_endpoints" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "we_active_idx" ON "webhook_endpoints" USING btree ("is_active");