-- 0091_tax_pack — S0 schema wave: Nigerian compliance pack (TIN validation + WHT remittances).
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- (a) tin_validations — TIN validation results per vendor/merchant subject.
-- subject_id is varchar because vendors.id is varchar (spec's "int" adapted to the
-- referenced column type).
CREATE TABLE IF NOT EXISTS "tin_validations" (
  "id" serial PRIMARY KEY,
  "subject_type" varchar(16) NOT NULL,
  "subject_id" varchar(255) NOT NULL,
  "tin" varchar(32) NOT NULL,
  "status" varchar(16) DEFAULT 'unverified' NOT NULL,
  "validated_at" timestamp,
  "validator_ref" varchar(128),
  "raw_response" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tin_validations_subject_idx" ON "tin_validations" USING btree ("subject_type", "subject_id");
--> statement-breakpoint

-- (b) wht_remittances — periodic WHT aggregation + filing/remittance tracking.
CREATE TABLE IF NOT EXISTS "wht_remittances" (
  "id" serial PRIMARY KEY,
  "merchant_id" text NOT NULL,
  "period" varchar(7) NOT NULL,
  "total_wht_kobo" bigint DEFAULT 0 NOT NULL,
  "record_count" integer DEFAULT 0,
  "status" varchar(16) DEFAULT 'draft' NOT NULL,
  "filed_at" timestamp,
  "remitted_at" timestamp,
  "reference" varchar(128),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wht_remittances_merchant_idx" ON "wht_remittances" USING btree ("merchant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wht_remittances_period_idx" ON "wht_remittances" USING btree ("period");
--> statement-breakpoint

-- (c) tax_withholding_records — link per-payment WHT lines to bills/vendors.
ALTER TABLE "tax_withholding_records" ADD COLUMN IF NOT EXISTS "bill_id" text;
--> statement-breakpoint
ALTER TABLE "tax_withholding_records" ADD COLUMN IF NOT EXISTS "vendor_id" varchar(255);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "twr_bill_idx" ON "tax_withholding_records" USING btree ("bill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "twr_vendor_idx" ON "tax_withholding_records" USING btree ("vendor_id");
