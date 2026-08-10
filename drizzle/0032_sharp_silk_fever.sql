CREATE TABLE "bulk_collection_items" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"amount_kobo" bigint NOT NULL,
	"status" text DEFAULT 'pending',
	"payment_link_url" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"status" text DEFAULT 'pending',
	"total_amount_kobo" bigint DEFAULT 0,
	"count" integer DEFAULT 0,
	"collected" integer DEFAULT 0,
	"collected_amount_kobo" bigint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashback_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"cashback_balance_kobo" bigint DEFAULT 0,
	"total_earned_kobo" bigint DEFAULT 0,
	"total_redeemed_kobo" bigint DEFAULT 0,
	"pending_kobo" bigint DEFAULT 0,
	"tier" text DEFAULT 'bronze',
	"cashback_rate" text DEFAULT '0.02',
	"max_cashback_kobo" bigint DEFAULT 50000,
	"min_transaction_kobo" bigint DEFAULT 10000,
	"enabled" integer DEFAULT 1,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cashback_balances_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "cashback_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"description" text,
	"related_transaction_id" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_insurance_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"description" text NOT NULL,
	"claim_amount_kobo" bigint NOT NULL,
	"approved_amount_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'submitted',
	"evidence_urls" jsonb,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_insurance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"provider" text NOT NULL,
	"premium_kobo" bigint NOT NULL,
	"coverage_kobo" bigint NOT NULL,
	"status" text DEFAULT 'active',
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_gold_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"gold_grams" text DEFAULT '0' NOT NULL,
	"purchased_grams" text DEFAULT '0' NOT NULL,
	"avg_purchase_price_per_gram" bigint DEFAULT 0,
	"current_price_per_gram" bigint DEFAULT 0,
	"current_value_kobo" bigint DEFAULT 0,
	"unrealized_pnl_kobo" bigint DEFAULT 0,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_gold_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"gold_grams" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"price_per_gram" bigint NOT NULL,
	"status" text DEFAULT 'completed',
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "digital_gold_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "emi_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"order_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"tenure" integer NOT NULL,
	"principal_kobo" bigint NOT NULL,
	"interest_rate" text DEFAULT '0',
	"processing_fee_kobo" bigint DEFAULT 0,
	"total_amount_kobo" bigint NOT NULL,
	"monthly_installment_kobo" bigint NOT NULL,
	"paid_installments" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emi_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"emi_contract_id" text NOT NULL,
	"installment_no" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"paid_amount_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'pending',
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gold_sip_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"frequency" text NOT NULL,
	"status" text DEFAULT 'active',
	"next_run_at" timestamp,
	"total_invested_kobo" bigint DEFAULT 0,
	"total_gold_grams" text DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intl_remittance_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"corridor_id" text NOT NULL,
	"send_amount_usd" text NOT NULL,
	"receive_amount" text NOT NULL,
	"receive_currency" text NOT NULL,
	"exchange_rate" text NOT NULL,
	"fee_usd" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_account_number" text NOT NULL,
	"recipient_bank_code" text NOT NULL,
	"recipient_country" text NOT NULL,
	"purpose" text,
	"tracking_number" text,
	"status" text DEFAULT 'processing',
	"provider" text,
	"estimated_delivery" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intl_remittance_transfers_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "mutual_fund_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"fund_name" text NOT NULL,
	"units" text DEFAULT '0' NOT NULL,
	"avg_nav_at_purchase" text DEFAULT '0' NOT NULL,
	"current_nav" text DEFAULT '0',
	"invested_amount_kobo" bigint DEFAULT 0,
	"current_value_kobo" bigint DEFAULT 0,
	"unrealized_pnl_kobo" bigint DEFAULT 0,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutual_fund_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"units" text NOT NULL,
	"nav_at_transaction" text NOT NULL,
	"status" text DEFAULT 'completed',
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mutual_fund_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "nodal_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"account_number" text,
	"bank_name" text NOT NULL,
	"bank_code" text NOT NULL,
	"purpose" text NOT NULL,
	"description" text,
	"balance_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nodal_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "nodal_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"nodal_account_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"narration" text,
	"counterparty_name" text,
	"counterparty_account" text,
	"counterparty_bank" text,
	"reference" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nodal_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "pension_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"rsa_pin" text,
	"pfa" text DEFAULT 'PayGate PFA' NOT NULL,
	"fund_type" text DEFAULT 'fund_ii',
	"balance_kobo" bigint DEFAULT 0,
	"employer_contribution_kobo" bigint DEFAULT 0,
	"employee_contribution_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pension_accounts_rsa_pin_unique" UNIQUE("rsa_pin")
);
--> statement-breakpoint
CREATE TABLE "pension_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"pension_account_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'processed',
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pension_contributions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "portal_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"plan" text DEFAULT 'free',
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'active',
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portal_subscriptions_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "privacy_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"alias" text NOT NULL,
	"expires_at" timestamp,
	"status" text DEFAULT 'active',
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "privacy_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"privacy_mode" text DEFAULT 'standard',
	"hide_business_name" integer DEFAULT 0,
	"hide_bank_details" integer DEFAULT 0,
	"use_private_alias" integer DEFAULT 0,
	"private_alias" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_settings_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "report_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"format" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"filters" jsonb,
	"status" text DEFAULT 'pending',
	"row_count" integer DEFAULT 0,
	"download_url" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "retail_pos_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"store_name" text NOT NULL,
	"store_address" text,
	"currency" text DEFAULT 'NGN',
	"tax_rate" text DEFAULT '0.075',
	"receipt_footer" text,
	"enable_inventory_alerts" integer DEFAULT 1,
	"low_stock_threshold" integer DEFAULT 10,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "retail_pos_configs_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "retail_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"items" jsonb NOT NULL,
	"subtotal_kobo" bigint NOT NULL,
	"tax_kobo" bigint DEFAULT 0,
	"total_kobo" bigint NOT NULL,
	"payment_method" text NOT NULL,
	"receipt_url" text,
	"reference" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "retail_sales_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "salary_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"employee_email" text NOT NULL,
	"account_number" text,
	"bank_code" text DEFAULT '044',
	"bank_name" text DEFAULT 'Access Bank',
	"salary_kobo" bigint NOT NULL,
	"balance_kobo" bigint DEFAULT 0,
	"advance_used_kobo" bigint DEFAULT 0,
	"max_advance_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "salary_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"salary_account_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"description" text,
	"reference" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"frequency" text NOT NULL,
	"format" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'active',
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soundbox_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'online',
	"volume" integer DEFAULT 80,
	"language" text DEFAULT 'en',
	"custom_message" text,
	"last_seen" timestamp DEFAULT now(),
	"total_transactions" integer DEFAULT 0,
	"total_volume_kobo" bigint DEFAULT 0,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "soundbox_devices_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN',
	"interval" text NOT NULL,
	"interval_count" integer DEFAULT 1,
	"trial_days" integer DEFAULT 0,
	"features" jsonb,
	"active_subscribers" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"stripe_product_id" text,
	"stripe_price_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"status" text DEFAULT 'active',
	"start_date" timestamp DEFAULT now() NOT NULL,
	"next_billing_date" timestamp,
	"cancelled_at" timestamp,
	"paused_at" timestamp,
	"total_paid_kobo" bigint DEFAULT 0,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wealth_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general',
	"target_amount_kobo" bigint NOT NULL,
	"current_amount_kobo" bigint DEFAULT 0,
	"deadline" timestamp,
	"status" text DEFAULT 'active',
	"progress_pct" text DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wealth_risk_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"risk_score" integer DEFAULT 5,
	"risk_category" text DEFAULT 'moderate',
	"investment_horizon" text DEFAULT '5-10 years',
	"last_assessed" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wealth_risk_profiles_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE INDEX "bci_collection_idx" ON "bulk_collection_items" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "bc_merchant_idx" ON "bulk_collections" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cb_merchant_idx" ON "cashback_balances" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cbt_merchant_idx" ON "cashback_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cic_policy_idx" ON "consumer_insurance_claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "cic_merchant_idx" ON "consumer_insurance_claims" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cip_merchant_idx" ON "consumer_insurance_policies" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cip_customer_idx" ON "consumer_insurance_policies" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "dgh_merchant_idx" ON "digital_gold_holdings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "dgt_merchant_idx" ON "digital_gold_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ec_merchant_idx" ON "emi_contracts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ec_order_idx" ON "emi_contracts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ei_contract_idx" ON "emi_installments" USING btree ("emi_contract_id");--> statement-breakpoint
CREATE INDEX "gsp_merchant_idx" ON "gold_sip_plans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "irt_merchant_idx" ON "intl_remittance_transfers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "irt_tracking_idx" ON "intl_remittance_transfers" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "mfh_merchant_idx" ON "mutual_fund_holdings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mfh_fund_idx" ON "mutual_fund_holdings" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "mft_merchant_idx" ON "mutual_fund_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "na_merchant_idx" ON "nodal_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nt_account_idx" ON "nodal_transactions" USING btree ("nodal_account_id");--> statement-breakpoint
CREATE INDEX "pa_merchant_idx" ON "pension_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pc_account_idx" ON "pension_contributions" USING btree ("pension_account_id");--> statement-breakpoint
CREATE INDEX "psub_merchant_idx" ON "portal_subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pal_merchant_idx" ON "privacy_aliases" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ps_merchant_idx" ON "privacy_settings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rj_merchant_idx" ON "report_jobs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rj_status_idx" ON "report_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rpc_merchant_idx" ON "retail_pos_configs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rs_merchant_idx" ON "retail_sales" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rs_created_idx" ON "retail_sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sa_merchant_idx" ON "salary_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sa_employee_idx" ON "salary_accounts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "st_account_idx" ON "salary_transactions" USING btree ("salary_account_id");--> statement-breakpoint
CREATE INDEX "sr_merchant_idx" ON "scheduled_reports" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sd_merchant_idx" ON "soundbox_devices" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "spv2_merchant_idx" ON "subscription_plans_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ss_plan_idx" ON "subscription_subscribers" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "ss_merchant_idx" ON "subscription_subscribers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "wg_merchant_idx" ON "wealth_goals" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "wrp_merchant_idx" ON "wealth_risk_profiles" USING btree ("merchant_id");