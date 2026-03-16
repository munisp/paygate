CREATE TABLE "bill_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_id" text NOT NULL,
	"category" text NOT NULL,
	"biller_code" text NOT NULL,
	"biller_name" text NOT NULL,
	"customer_reference" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance_kobo" bigint DEFAULT 0 NOT NULL,
	"ledger_account_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "p2p_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_wallet_id" text NOT NULL,
	"recipient_account_number" text NOT NULL,
	"recipient_bank_code" text NOT NULL,
	"recipient_bank_name" text,
	"recipient_name" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"narration" text,
	"nip_session_id" text,
	"nip_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"amount" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"claimed_by" integer,
	"claimed_at" timestamp,
	"transaction_ref" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "red_envelope_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"claimant_id" integer NOT NULL,
	"claimant_wallet_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "red_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_wallet_id" text NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"slots" integer DEFAULT 5 NOT NULL,
	"claimed_slots" integer DEFAULT 0 NOT NULL,
	"message" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_number" text NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"nickname" text,
	"transfer_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_wallets" ADD CONSTRAINT "consumer_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2p_transfers" ADD CONSTRAINT "p2p_transfers_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2p_transfers" ADD CONSTRAINT "p2p_transfers_sender_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("sender_wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelope_claims" ADD CONSTRAINT "red_envelope_claims_envelope_id_red_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."red_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelope_claims" ADD CONSTRAINT "red_envelope_claims_claimant_id_users_id_fk" FOREIGN KEY ("claimant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelope_claims" ADD CONSTRAINT "red_envelope_claims_claimant_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("claimant_wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelopes" ADD CONSTRAINT "red_envelopes_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelopes" ADD CONSTRAINT "red_envelopes_sender_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("sender_wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_beneficiaries" ADD CONSTRAINT "saved_beneficiaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bp_user_idx" ON "bill_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bp_status_idx" ON "bill_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bp_created_idx" ON "bill_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cw_user_idx" ON "consumer_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cw_user_currency_idx" ON "consumer_wallets" USING btree ("user_id","currency");--> statement-breakpoint
CREATE INDEX "p2p_sender_idx" ON "p2p_transfers" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "p2p_status_idx" ON "p2p_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "p2p_created_idx" ON "p2p_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "qr_merchant_idx" ON "qr_payments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "qr_status_idx" ON "qr_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rec_envelope_idx" ON "red_envelope_claims" USING btree ("envelope_id");--> statement-breakpoint
CREATE INDEX "rec_claimant_idx" ON "red_envelope_claims" USING btree ("claimant_id");--> statement-breakpoint
CREATE INDEX "re_sender_idx" ON "red_envelopes" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "re_status_idx" ON "red_envelopes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sb_user_idx" ON "saved_beneficiaries" USING btree ("user_id");