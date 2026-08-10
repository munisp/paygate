CREATE TABLE "consumer_wallet_txns" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance_after_kobo" bigint NOT NULL,
	"description" text,
	"reference" text,
	"counterparty_name" text,
	"counterparty_account" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumer_wallet_txns" ADD CONSTRAINT "consumer_wallet_txns_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_wallet_txns" ADD CONSTRAINT "consumer_wallet_txns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cwt_wallet_idx" ON "consumer_wallet_txns" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "cwt_user_idx" ON "consumer_wallet_txns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cwt_created_idx" ON "consumer_wallet_txns" USING btree ("created_at");