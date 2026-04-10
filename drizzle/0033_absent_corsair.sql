CREATE TABLE "agent_banking_v4_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"agent_code" text NOT NULL,
	"agent_name" text NOT NULL,
	"phone" text NOT NULL,
	"state" text DEFAULT 'Lagos' NOT NULL,
	"lga" text DEFAULT 'Ikeja' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"float_balance" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer DEFAULT 500000 NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_volume" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_banking_v4_agents_agent_code_unique" UNIQUE("agent_code")
);
--> statement-breakpoint
CREATE TABLE "carbon_credit_transactions_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"credit_id" text NOT NULL,
	"type" text DEFAULT 'purchase' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbon_credits_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"project_name" text NOT NULL,
	"project_type" text DEFAULT 'reforestation' NOT NULL,
	"country" text DEFAULT 'NG' NOT NULL,
	"vintage_year" integer DEFAULT 2024 NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"price_per_tonne" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"certification_body" text DEFAULT 'Gold Standard',
	"serial_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_offramp_v2_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"crypto_asset" text DEFAULT 'USDT' NOT NULL,
	"crypto_amount" text DEFAULT '0' NOT NULL,
	"fiat_currency" text DEFAULT 'NGN' NOT NULL,
	"fiat_amount" integer DEFAULT 0 NOT NULL,
	"exchange_rate" text DEFAULT '0' NOT NULL,
	"bank_code" text,
	"account_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"wallet_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_contracts_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"buyer_id" text,
	"seller_id" text,
	"title" text NOT NULL,
	"description" text,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"release_conditions" text,
	"dispute_reason" text,
	"milestones" text,
	"expires_at" timestamp,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_financing_v2_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"invoice_id" text,
	"invoice_amount" integer DEFAULT 0 NOT NULL,
	"requested_amount" integer DEFAULT 0 NOT NULL,
	"approved_amount" integer,
	"interest_rate" text DEFAULT '3.5' NOT NULL,
	"tenor_days" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"disbursed_at" timestamp,
	"repaid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_v3_members" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_email" text NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_v3_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"program_name" text NOT NULL,
	"points_per_naira" integer DEFAULT 1 NOT NULL,
	"redemption_rate" integer DEFAULT 100 NOT NULL,
	"expiry_days" integer DEFAULT 365 NOT NULL,
	"tiers" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"total_members" integer DEFAULT 0 NOT NULL,
	"total_points_issued" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"buyer_email" text NOT NULL,
	"seller_merchant_id" text,
	"items" text DEFAULT '[]' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"platform_fee" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text DEFAULT 'card',
	"escrow_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multi_currency_ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"currency" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"available_balance" integer DEFAULT 0 NOT NULL,
	"reserved_balance" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multi_currency_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"account_id" text NOT NULL,
	"type" text DEFAULT 'credit' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"description" text,
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfc_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text NOT NULL,
	"device_type" text DEFAULT 'android' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen" timestamp,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_volume" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nfc_devices_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "nfc_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"card_scheme" text DEFAULT 'mastercard' NOT NULL,
	"masked_pan" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"response_code" text DEFAULT '00',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_banking_accounts_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"consent_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_type" text DEFAULT 'current' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_banking_consents_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"scopes" text DEFAULT 'accounts' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_token" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_v3_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"department" text DEFAULT 'General' NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"gross_salary" integer DEFAULT 0 NOT NULL,
	"tax_pin" text,
	"pension_pin" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_v3_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"run_name" text NOT NULL,
	"period" text NOT NULL,
	"total_employees" integer DEFAULT 0 NOT NULL,
	"total_gross" integer DEFAULT 0 NOT NULL,
	"total_deductions" integer DEFAULT 0 NOT NULL,
	"total_net" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_notification_history" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'delivered' NOT NULL,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"webhook_enabled" integer DEFAULT 1 NOT NULL,
	"email_enabled" integer DEFAULT 1 NOT NULL,
	"sms_enabled" integer DEFAULT 0 NOT NULL,
	"push_enabled" integer DEFAULT 1 NOT NULL,
	"in_app_enabled" integer DEFAULT 1 NOT NULL,
	"event_payment" integer DEFAULT 1 NOT NULL,
	"event_dispute" integer DEFAULT 1 NOT NULL,
	"event_payout" integer DEFAULT 1 NOT NULL,
	"event_fraud" integer DEFAULT 1 NOT NULL,
	"event_kyc" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "realtime_notification_preferences_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "regulatory_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"report_type" text DEFAULT 'CBN_MONTHLY' NOT NULL,
	"period" text NOT NULL,
	"regulator" text DEFAULT 'CBN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp,
	"acknowledged_at" timestamp,
	"report_data" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_agent_v2_networks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_name" text NOT NULL,
	"total_agents" integer DEFAULT 0 NOT NULL,
	"active_agents" integer DEFAULT 0 NOT NULL,
	"total_float" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_filing_records" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tax_type" text DEFAULT 'VAT' NOT NULL,
	"period" text NOT NULL,
	"taxable_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"filed_at" timestamp,
	"receipt_number" text,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usdc_v2_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text DEFAULT 'receive' NOT NULL,
	"amount_usdc" text DEFAULT '0' NOT NULL,
	"amount_ngn" integer,
	"tx_hash" text,
	"from_address" text,
	"to_address" text,
	"network" text DEFAULT 'polygon' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usdc_v2_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"network" text DEFAULT 'polygon' NOT NULL,
	"balance_usdc" text DEFAULT '0' NOT NULL,
	"balance_ngn" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usdc_v2_wallets_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE INDEX "ab_v4_merchant_idx" ON "agent_banking_v4_agents" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cc_v2_tx_merchant_idx" ON "carbon_credit_transactions_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cc_v2_merchant_idx" ON "carbon_credits_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "crypto_offramp_v2_merchant_idx" ON "crypto_offramp_v2_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "escrow_v2_merchant_idx" ON "escrow_contracts_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "inv_fin_v2_merchant_idx" ON "invoice_financing_v2_applications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_member_merchant_idx" ON "loyalty_v3_members" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_merchant_idx" ON "loyalty_v3_programs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mp_order_merchant_idx" ON "marketplace_orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mcl_merchant_idx" ON "multi_currency_ledger_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mcl_entry_merchant_idx" ON "multi_currency_ledger_entries" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nfc_device_merchant_idx" ON "nfc_devices" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nfc_tx_merchant_idx" ON "nfc_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ob_v2_acc_merchant_idx" ON "open_banking_accounts_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ob_v2_merchant_idx" ON "open_banking_consents_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payroll_v3_emp_merchant_idx" ON "payroll_v3_employees" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payroll_v3_merchant_idx" ON "payroll_v3_runs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rtn_hist_merchant_idx" ON "realtime_notification_history" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rtn_pref_merchant_idx" ON "realtime_notification_preferences" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "reg_report_merchant_idx" ON "regulatory_reports" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sa_v2_merchant_idx" ON "super_agent_v2_networks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "tax_filing_merchant_idx" ON "tax_filing_records" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "usdc_v2_tx_merchant_idx" ON "usdc_v2_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "usdc_v2_wallet_merchant_idx" ON "usdc_v2_wallets" USING btree ("merchant_id");