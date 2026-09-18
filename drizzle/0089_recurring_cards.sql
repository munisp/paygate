-- 0089_recurring_cards — S0 schema wave: recurring auto-pay schedules, single-use
-- virtual card extensions, and AR invoice fee-choice/partial-payment columns.
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- (a) ap_recurring_schedules — P1-d recurring bill generation + auto-pay.
CREATE TABLE IF NOT EXISTS "ap_recurring_schedules" (
  "id" serial PRIMARY KEY,
  "merchant_id" text NOT NULL,
  "vendor_id" varchar(255),
  "bill_template" jsonb,
  "frequency" varchar(16) DEFAULT 'monthly' NOT NULL,
  "next_run_at" timestamp,
  "last_run_at" timestamp,
  "run_count" integer DEFAULT 0,
  "max_runs" integer,
  "max_amount_kobo" bigint,
  "auto_approve_below_kobo" bigint,
  "is_active" boolean DEFAULT true,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_recurring_schedules_merchant_idx" ON "ap_recurring_schedules" USING btree ("merchant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_recurring_schedules_next_run_idx" ON "ap_recurring_schedules" USING btree ("next_run_at") WHERE "is_active" = true;
--> statement-breakpoint

-- (b) virtual_cards — P1-e single-use vendor-locked cards.
ALTER TABLE "virtual_cards" ADD COLUMN IF NOT EXISTS "single_use" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "virtual_cards" ADD COLUMN IF NOT EXISTS "authorized_amount_kobo" bigint;
--> statement-breakpoint
ALTER TABLE "virtual_cards" ADD COLUMN IF NOT EXISTS "locked_merchant_vendor_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "virtual_cards" ADD COLUMN IF NOT EXISTS "terminated_at" timestamp;
--> statement-breakpoint

-- (c) invoices — P1-c AR fee-choice (surcharge disclosure) + P2-c partial payments.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "fee_policy" varchar(32) DEFAULT 'merchant_absorbs';
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "surcharge_bps" integer DEFAULT 290;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "allow_partial" boolean DEFAULT true;
