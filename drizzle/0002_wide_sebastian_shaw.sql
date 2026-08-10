CREATE TYPE "public"."bnpl_status" AS ENUM('pending', 'active', 'completed', 'defaulted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_status" AS ENUM('open', 'investigating', 'resolved', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_type" AS ENUM('velocity_breach', 'card_testing', 'unusual_location', 'account_takeover', 'chargeback_pattern', 'identity_mismatch', 'device_fingerprint', 'ip_blacklist');--> statement-breakpoint
CREATE TYPE "public"."kyc_doc_type" AS ENUM('passport', 'national_id', 'drivers_license', 'utility_bill', 'bank_statement', 'cac_certificate');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('not_started', 'pending', 'under_review', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."mm_recon_status" AS ENUM('matched', 'unmatched', 'disputed', 'pending');--> statement-breakpoint
CREATE TABLE "bnpl_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"customer_id" text,
	"principal_amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"installments" integer DEFAULT 3 NOT NULL,
	"installment_amount" bigint NOT NULL,
	"interest_rate" integer DEFAULT 0 NOT NULL,
	"status" "bnpl_status" DEFAULT 'pending' NOT NULL,
	"next_payment_at" timestamp,
	"completed_at" timestamp,
	"defaulted_at" timestamp,
	"customer_email" text,
	"customer_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"customer_id" text,
	"alert_type" "fraud_alert_type" NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"status" "fraud_alert_status" DEFAULT 'open' NOT NULL,
	"description" text,
	"metadata" jsonb,
	"resolved_at" timestamp,
	"resolved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"doc_type" "kyc_doc_type" NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"document_url" text,
	"selfie_url" text,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_money_recon" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" "mm_recon_status" DEFAULT 'pending' NOT NULL,
	"reconciled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_recon" ADD CONSTRAINT "mobile_money_recon_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_recon" ADD CONSTRAINT "mobile_money_recon_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bnpl_merchant_idx" ON "bnpl_loans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "bnpl_status_idx" ON "bnpl_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fraud_alerts_merchant_idx" ON "fraud_alerts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fraud_alerts_status_idx" ON "fraud_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_merchant_idx" ON "kyc_submissions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "kyc_status_idx" ON "kyc_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mm_recon_merchant_idx" ON "mobile_money_recon" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mm_recon_status_idx" ON "mobile_money_recon" USING btree ("status");