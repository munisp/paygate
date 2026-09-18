-- 0088_ap_bills — Melio-inspired AP/AR suite (S0 schema wave): vendor extension + AP bills core.
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Enum-like fields use varchar + app-level (zod) validation, matching the dominant
-- pattern for feature tables in this repo. Money is bigint kobo.
-- NOTE on FK types: merchants.id / payouts.id / virtual_cards.id are text and
-- vendors.id is varchar, so merchant_id/payout_id/vendor_card_id are text and
-- vendor_id is varchar (the spec's "int" annotations are adapted to the actual
-- referenced column types so foreign keys can hold real values).

-- (a) vendors — D7: extend the EXISTING vendors table (no parallel table).
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "tin" varchar(32);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "bank_code" varchar(16);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "account_number" varchar(32);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "account_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "credit_balance_kobo" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "open_balance_kobo" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "wht_rate_pct" numeric(5,2);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "is_wht_applicable" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- (b) ap_bills — vendor bills (manual/email/upload/ocr/accounting_sync sources).
CREATE TABLE IF NOT EXISTS "ap_bills" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "merchant_id" text NOT NULL,
  "vendor_id" varchar(255),
  "bill_number" varchar(64),
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "currency" varchar(3) DEFAULT 'NGN',
  "subtotal_kobo" bigint,
  "tax_kobo" bigint,
  "wht_kobo" bigint DEFAULT 0,
  "total_kobo" bigint NOT NULL,
  "amount_paid_kobo" bigint DEFAULT 0,
  "due_date" timestamp,
  "source" varchar(32) DEFAULT 'manual',
  "source_ref" varchar(255),
  "document_url" text,
  "extracted_data" jsonb,
  "idempotency_key" varchar(128),
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ap_bills_merchant_bill_vendor_uniq" ON "ap_bills" USING btree ("merchant_id", "bill_number", "vendor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ap_bills_merchant_idem_uniq" ON "ap_bills" USING btree ("merchant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_bills_merchant_idx" ON "ap_bills" USING btree ("merchant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_bills_vendor_idx" ON "ap_bills" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_bills_status_idx" ON "ap_bills" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_bills_due_date_idx" ON "ap_bills" USING btree ("due_date");
--> statement-breakpoint

-- (c) ap_bill_line_items — bill_id references ap_bills(id).
CREATE TABLE IF NOT EXISTS "ap_bill_line_items" (
  "id" serial PRIMARY KEY,
  "bill_id" text NOT NULL,
  "description" text,
  "quantity" numeric,
  "unit_price_kobo" bigint,
  "amount_kobo" bigint,
  "account_code" varchar(32)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_bill_line_items_bill_idx" ON "ap_bill_line_items" USING btree ("bill_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ap_bill_line_items_bill_id_fk') THEN
    ALTER TABLE "ap_bill_line_items" ADD CONSTRAINT "ap_bill_line_items_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "ap_bills"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint

-- (d) ap_payments — disbursements against bills (rides the existing payouts path).
CREATE TABLE IF NOT EXISTS "ap_payments" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "bill_id" text NOT NULL,
  "merchant_id" text NOT NULL,
  "payout_id" text,
  "funding_method" varchar(32) DEFAULT 'wallet' NOT NULL,
  "amount_kobo" bigint NOT NULL,
  "fee_kobo" bigint DEFAULT 0,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "reference" varchar(128),
  "vendor_card_id" text,
  "remittance_sent_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ap_payments_reference_uniq" ON "ap_payments" USING btree ("reference") WHERE "reference" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_payments_bill_idx" ON "ap_payments" USING btree ("bill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_payments_merchant_idx" ON "ap_payments" USING btree ("merchant_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ap_payments_bill_id_fk') THEN
    ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "ap_bills"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint

-- (e) ap_bill_approval_rules — P1-a maker/checker approval chains.
CREATE TABLE IF NOT EXISTS "ap_bill_approval_rules" (
  "id" serial PRIMARY KEY,
  "merchant_id" text NOT NULL,
  "name" varchar(255) NOT NULL,
  "priority" integer DEFAULT 0,
  "min_amount_kobo" bigint,
  "max_amount_kobo" bigint,
  "vendor_id" varchar(255),
  "approver_role" varchar(64),
  "approver_user_id" integer,
  "required_approvals" integer DEFAULT 1,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_bill_approval_rules_merchant_idx" ON "ap_bill_approval_rules" USING btree ("merchant_id");
--> statement-breakpoint

-- (f) ap_bill_approvals — ordered approval steps per bill.
CREATE TABLE IF NOT EXISTS "ap_bill_approvals" (
  "id" serial PRIMARY KEY,
  "bill_id" text NOT NULL,
  "rule_id" integer,
  "step" integer NOT NULL,
  "approver_user_id" integer NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "decided_at" timestamp,
  "notes" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ap_bill_approvals_bill_step_approver_uniq" ON "ap_bill_approvals" USING btree ("bill_id", "step", "approver_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_bill_approvals_bill_idx" ON "ap_bill_approvals" USING btree ("bill_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ap_bill_approvals_bill_id_fk') THEN
    ALTER TABLE "ap_bill_approvals" ADD CONSTRAINT "ap_bill_approvals_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "ap_bills"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint

-- (g) vendor_credits — overpayment/refund/adjustment credit ledger per vendor.
CREATE TABLE IF NOT EXISTS "vendor_credits" (
  "id" serial PRIMARY KEY,
  "merchant_id" text NOT NULL,
  "vendor_id" varchar(255) NOT NULL,
  "amount_kobo" bigint NOT NULL,
  "remaining_kobo" bigint NOT NULL,
  "source" varchar(32) DEFAULT 'adjustment',
  "bill_id" text,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "applied_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_credits_merchant_idx" ON "vendor_credits" USING btree ("merchant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_credits_vendor_idx" ON "vendor_credits" USING btree ("vendor_id");
