CREATE TABLE "inventory_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"delta" bigint NOT NULL,
	"reason" text NOT NULL,
	"reference_id" text,
	"previous_stock" bigint NOT NULL,
	"new_stock" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"reservation_id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"quantity" bigint NOT NULL,
	"order_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"points" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD COLUMN "program_id" text DEFAULT 'default';--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "inv_audit_item_idx" ON "inventory_audit_log" USING btree ("item_id","merchant_id");--> statement-breakpoint
CREATE INDEX "inv_audit_created_idx" ON "inventory_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inv_res_item_merchant_idx" ON "inventory_reservations" USING btree ("item_id","merchant_id");--> statement-breakpoint
CREATE INDEX "inv_res_status_idx" ON "inventory_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inv_res_expires_idx" ON "inventory_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "loyalty_ledger_account_idx" ON "loyalty_ledger" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "loyalty_ledger_account_created_idx" ON "loyalty_ledger" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_merchant_created_idx" ON "customers" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "disputes_merchant_created_idx" ON "disputes" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "fraud_alerts_merchant_created_idx" ON "fraud_alerts" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "fraud_alerts_merchant_status_idx" ON "fraud_alerts" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "loyalty_account_id_idx" ON "loyalty_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "payouts_merchant_created_idx" ON "payouts" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_merchant_status_idx" ON "payouts" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "transactions_merchant_created_idx" ON "transactions" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_merchant_status_idx" ON "transactions" USING btree ("merchant_id","status");--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_account_id_unique" UNIQUE("account_id");