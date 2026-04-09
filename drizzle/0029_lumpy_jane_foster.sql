CREATE TABLE "consumer_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_txn_id" text,
	"merchant_dispute_id" text,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"evidence_urls" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_fraud_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_txn_id" text,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"flag_reason" text NOT NULL,
	"flag_type" text DEFAULT 'ml_model' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" integer,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" text NOT NULL,
	"response_payload" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_idempotency_keys_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "consumer_disputes" ADD CONSTRAINT "consumer_disputes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_disputes" ADD CONSTRAINT "consumer_disputes_wallet_txn_id_consumer_wallet_txns_id_fk" FOREIGN KEY ("wallet_txn_id") REFERENCES "public"."consumer_wallet_txns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_fraud_flags" ADD CONSTRAINT "consumer_fraud_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_fraud_flags" ADD CONSTRAINT "consumer_fraud_flags_wallet_txn_id_consumer_wallet_txns_id_fk" FOREIGN KEY ("wallet_txn_id") REFERENCES "public"."consumer_wallet_txns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_fraud_flags" ADD CONSTRAINT "consumer_fraud_flags_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_idempotency_keys" ADD CONSTRAINT "consumer_idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cd_user_idx" ON "consumer_disputes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cd_status_idx" ON "consumer_disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cff_user_idx" ON "consumer_fraud_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cff_status_idx" ON "consumer_fraud_flags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cff_score_idx" ON "consumer_fraud_flags" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX "cik_user_idx" ON "consumer_idempotency_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cik_key_idx" ON "consumer_idempotency_keys" USING btree ("idempotency_key");