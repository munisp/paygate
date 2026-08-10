CREATE TABLE "consumer_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_id" text NOT NULL,
	"masked_pan" text NOT NULL,
	"card_brand" text DEFAULT 'visa' NOT NULL,
	"expiry_month" text NOT NULL,
	"expiry_year" text NOT NULL,
	"cardholder_name" text NOT NULL,
	"spending_limit_kobo" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"contact_user_id" integer,
	"nickname" text,
	"phone" text,
	"account_number" text,
	"bank_code" text,
	"bank_name" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_kyc_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"phone" text,
	"bvn" text,
	"nin" text,
	"selfie_url" text,
	"id_doc_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"rejection_reason" text,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_kyc_records_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_loyalty_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_loyalty_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_loyalty_txns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_phone_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"phone" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_pins" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_recurring_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"biller_code" text,
	"customer_reference" text,
	"recipient_account_number" text,
	"recipient_bank_code" text,
	"recipient_name" text,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"frequency" text NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"run_count" integer DEFAULT 0 NOT NULL,
	"max_runs" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_split_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"share_amount_kobo" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"wallet_txn_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_split_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"title" text NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"amount_saved_kobo" bigint NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value" integer NOT NULL,
	"min_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"max_discount_kobo" bigint,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "money_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" integer NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payer_user_id" integer,
	"payer_name" text,
	"paid_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumer_cards" ADD CONSTRAINT "consumer_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_cards" ADD CONSTRAINT "consumer_cards_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_contacts" ADD CONSTRAINT "consumer_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_contacts" ADD CONSTRAINT "consumer_contacts_contact_user_id_users_id_fk" FOREIGN KEY ("contact_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_kyc_records" ADD CONSTRAINT "consumer_kyc_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_loyalty_accounts" ADD CONSTRAINT "consumer_loyalty_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_loyalty_txns" ADD CONSTRAINT "consumer_loyalty_txns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_phone_verifications" ADD CONSTRAINT "consumer_phone_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pins" ADD CONSTRAINT "consumer_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_recurring_payments" ADD CONSTRAINT "consumer_recurring_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_split_participants" ADD CONSTRAINT "consumer_split_participants_session_id_consumer_split_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consumer_split_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_split_participants" ADD CONSTRAINT "consumer_split_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_split_sessions" ADD CONSTRAINT "consumer_split_sessions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cc_card_user_idx" ON "consumer_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cc_user_idx" ON "consumer_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ckr_user_idx" ON "consumer_kyc_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clt_user_idx" ON "consumer_loyalty_txns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cpv_user_idx" ON "consumer_phone_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crp_user_idx" ON "consumer_recurring_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crp_next_run_idx" ON "consumer_recurring_payments" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "csp_session_idx" ON "consumer_split_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "css_creator_idx" ON "consumer_split_sessions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "cr_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "cr_user_idx" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mr_requester_idx" ON "money_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "mr_status_idx" ON "money_requests" USING btree ("status");