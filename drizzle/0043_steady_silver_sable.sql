CREATE TABLE "chargebacks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"stripe_charge_id" text,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_date" timestamp,
	"evidence_submitted" boolean DEFAULT false NOT NULL,
	"evidence_deadline" timestamp,
	"evidence" text,
	"notes" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" text NOT NULL,
	"limit_kobo" integer NOT NULL,
	"spent_kobo" integer DEFAULT 0 NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"alert_at" integer DEFAULT 80 NOT NULL,
	"alert_sent" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reset_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "consumer_savings_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_kobo" integer NOT NULL,
	"saved_kobo" integer DEFAULT 0 NOT NULL,
	"auto_save_enabled" boolean DEFAULT false NOT NULL,
	"auto_save_amount_kobo" integer DEFAULT 0 NOT NULL,
	"auto_save_frequency" text DEFAULT 'monthly' NOT NULL,
	"target_date" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"emoji" text DEFAULT '🎯',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 0 NOT NULL,
	"target_merchant_ids" text,
	"target_user_ids" text,
	"environment" text DEFAULT 'production' NOT NULL,
	"category" text DEFAULT 'feature' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "help_search_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"user_type" text DEFAULT 'merchant' NOT NULL,
	"user_id" text,
	"result_count" integer DEFAULT 0 NOT NULL,
	"clicked_section" text,
	"session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_risk_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"fraud_score" integer DEFAULT 0 NOT NULL,
	"chargeback_score" integer DEFAULT 0 NOT NULL,
	"kyc_score" integer DEFAULT 0 NOT NULL,
	"transaction_score" integer DEFAULT 0 NOT NULL,
	"velocity_score" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"factors" text,
	"recommendation" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_status_log" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"performed_by" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"identifier_type" text DEFAULT 'user' NOT NULL,
	"procedure" text,
	"endpoint" text,
	"window_ms" integer NOT NULL,
	"limit_val" integer NOT NULL,
	"count" integer NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referee_id" integer,
	"referral_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"referrer_reward_kobo" integer DEFAULT 50000 NOT NULL,
	"referee_reward_kobo" integer DEFAULT 25000 NOT NULL,
	"referrer_paid" boolean DEFAULT false NOT NULL,
	"referee_paid" boolean DEFAULT false NOT NULL,
	"qualification_txn_id" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "settlement_sla_events" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"expected_by" timestamp NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"breach_minutes" integer,
	"escalated_at" timestamp,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"user_id" integer,
	"merchant_id" text,
	"receipt_number" text NOT NULL,
	"pdf_url" text,
	"email_sent_at" timestamp,
	"email_address" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_receipts_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "transaction_receipts_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "webhook_simulator_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"webhook_id" text,
	"event_type" text NOT NULL,
	"payload" text NOT NULL,
	"response_status" integer,
	"response_body" text,
	"duration_ms" integer,
	"success" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumer_budgets" ADD CONSTRAINT "consumer_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_savings_goals" ADD CONSTRAINT "consumer_savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chargebacks_merchant_idx" ON "chargebacks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "chargebacks_status_idx" ON "chargebacks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chargebacks_due_date_idx" ON "chargebacks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "consumer_budgets_user_idx" ON "consumer_budgets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consumer_budgets_category_idx" ON "consumer_budgets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "savings_goals_user_idx" ON "consumer_savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_goals_status_idx" ON "consumer_savings_goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feature_flags_key_idx" ON "feature_flags" USING btree ("key");--> statement-breakpoint
CREATE INDEX "feature_flags_enabled_idx" ON "feature_flags" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "help_search_query_idx" ON "help_search_analytics" USING btree ("query");--> statement-breakpoint
CREATE INDEX "help_search_user_type_idx" ON "help_search_analytics" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "help_search_created_idx" ON "help_search_analytics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "merchant_risk_merchant_idx" ON "merchant_risk_scores" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_risk_level_idx" ON "merchant_risk_scores" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "merchant_status_log_merchant_idx" ON "merchant_status_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_status_log_action_idx" ON "merchant_status_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "merchant_status_log_created_idx" ON "merchant_status_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_identifier_idx" ON "rate_limit_events" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "rate_limit_blocked_idx" ON "rate_limit_events" USING btree ("blocked");--> statement-breakpoint
CREATE INDEX "rate_limit_created_idx" ON "rate_limit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "referrals_code_idx" ON "referrals" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sla_settlement_idx" ON "settlement_sla_events" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "sla_merchant_idx" ON "settlement_sla_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sla_status_idx" ON "settlement_sla_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sla_breached_idx" ON "settlement_sla_events" USING btree ("sla_breached");--> statement-breakpoint
CREATE INDEX "receipts_txn_idx" ON "transaction_receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "receipts_user_idx" ON "transaction_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "receipts_number_idx" ON "transaction_receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "webhook_sim_merchant_idx" ON "webhook_simulator_logs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "webhook_sim_event_type_idx" ON "webhook_simulator_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_sim_created_idx" ON "webhook_simulator_logs" USING btree ("created_at");