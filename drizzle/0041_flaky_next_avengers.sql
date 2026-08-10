CREATE TABLE "admin_notification_prefs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"slack_enabled" boolean DEFAULT false NOT NULL,
	"alert_new_merchant" boolean DEFAULT true NOT NULL,
	"alert_kyc_submission" boolean DEFAULT true NOT NULL,
	"alert_kyc_approval" boolean DEFAULT true NOT NULL,
	"alert_high_risk_txn" boolean DEFAULT true NOT NULL,
	"alert_fraud_escalation" boolean DEFAULT true NOT NULL,
	"alert_dispute_opened" boolean DEFAULT true NOT NULL,
	"alert_dispute_escalated" boolean DEFAULT true NOT NULL,
	"alert_payout_approval" boolean DEFAULT true NOT NULL,
	"alert_system_error" boolean DEFAULT true NOT NULL,
	"alert_bridge_down" boolean DEFAULT true NOT NULL,
	"alert_rate_limit" boolean DEFAULT false NOT NULL,
	"alert_daily_digest" boolean DEFAULT true NOT NULL,
	"alert_weekly_report" boolean DEFAULT true NOT NULL,
	"high_risk_score_threshold" integer DEFAULT 75 NOT NULL,
	"large_payout_threshold_kobo" integer DEFAULT 1000000000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_notification_prefs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_notification_prefs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"push_payments" boolean DEFAULT true NOT NULL,
	"push_fraud" boolean DEFAULT true NOT NULL,
	"push_promotions" boolean DEFAULT false NOT NULL,
	"push_system" boolean DEFAULT true NOT NULL,
	"push_disputes" boolean DEFAULT true NOT NULL,
	"push_loans" boolean DEFAULT true NOT NULL,
	"in_app_payments" boolean DEFAULT true NOT NULL,
	"in_app_fraud" boolean DEFAULT true NOT NULL,
	"in_app_promotions" boolean DEFAULT true NOT NULL,
	"in_app_system" boolean DEFAULT true NOT NULL,
	"in_app_disputes" boolean DEFAULT true NOT NULL,
	"in_app_loans" boolean DEFAULT true NOT NULL,
	"email_payments" boolean DEFAULT true NOT NULL,
	"email_fraud" boolean DEFAULT true NOT NULL,
	"email_promotions" boolean DEFAULT false NOT NULL,
	"email_system" boolean DEFAULT true NOT NULL,
	"email_disputes" boolean DEFAULT true NOT NULL,
	"email_loans" boolean DEFAULT false NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" text DEFAULT '22:00' NOT NULL,
	"quiet_hours_end" text DEFAULT '07:00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_notification_prefs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "admin_notification_prefs" ADD CONSTRAINT "admin_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_notification_prefs" ADD CONSTRAINT "consumer_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notif_pref_user_idx" ON "admin_notification_prefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consumer_notif_pref_user_idx" ON "consumer_notification_prefs" USING btree ("user_id");