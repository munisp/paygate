CREATE TABLE "nexthub_bulk_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulk_transfer_id" varchar(64) NOT NULL,
	"bulk_quote_id" varchar(64),
	"payer_fsp" varchar(64) NOT NULL,
	"payee_fsp" varchar(64) NOT NULL,
	"state" varchar(32) DEFAULT 'RECEIVED' NOT NULL,
	"total_transfers" integer DEFAULT 0 NOT NULL,
	"completed_transfers" integer DEFAULT 0 NOT NULL,
	"failed_transfers" integer DEFAULT 0 NOT NULL,
	"expiration" timestamp,
	"completed_at" timestamp,
	"error_code" varchar(8),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_bulk_transfers_bulk_transfer_id_unique" UNIQUE("bulk_transfer_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_currency" varchar(8) NOT NULL,
	"target_currency" varchar(8) NOT NULL,
	"rate" varchar(32) NOT NULL,
	"provider" varchar(64) DEFAULT 'nexthub-fx' NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_to" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_oracles" (
	"id" serial PRIMARY KEY NOT NULL,
	"oracle_id" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"party_id_type" varchar(32) NOT NULL,
	"currency" varchar(8),
	"endpoint" varchar(512) NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"health_status" varchar(16) DEFAULT 'UNKNOWN' NOT NULL,
	"last_health_check" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_oracles_oracle_id_unique" UNIQUE("oracle_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_pisp_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"consent_id" varchar(64) NOT NULL,
	"consent_request_id" varchar(64),
	"consumer_id" varchar(64) DEFAULT '' NOT NULL,
	"pisp_id" varchar(64) NOT NULL,
	"dfsp_id" varchar(64) NOT NULL,
	"state" varchar(32) DEFAULT 'REQUESTED' NOT NULL,
	"scopes" text DEFAULT '[]' NOT NULL,
	"auth_channels" text DEFAULT '[]',
	"credential" text,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoke_reason" varchar(128),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_pisp_consents_consent_id_unique" UNIQUE("consent_id")
);
--> statement-breakpoint
CREATE TABLE "velocity_breaches" (
	"id" serial PRIMARY KEY NOT NULL,
	"limit_config_id" integer NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"channel" varchar(32) NOT NULL,
	"amount_kobo" integer DEFAULT 0 NOT NULL,
	"user_id" integer DEFAULT 0 NOT NULL,
	"details" text,
	"breached_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "velocity_limit_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" varchar(64),
	"channel" varchar(32) DEFAULT 'all' NOT NULL,
	"limit_type" varchar(16) DEFAULT 'count' NOT NULL,
	"max_value" integer NOT NULL,
	"window_seconds" integer DEFAULT 3600 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "nbt_state_idx" ON "nexthub_bulk_transfers" USING btree ("state");--> statement-breakpoint
CREATE INDEX "nbt_payer_idx" ON "nexthub_bulk_transfers" USING btree ("payer_fsp");--> statement-breakpoint
CREATE INDEX "nbt_created_idx" ON "nexthub_bulk_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nfr_pair_idx" ON "nexthub_fx_rates" USING btree ("source_currency","target_currency");--> statement-breakpoint
CREATE INDEX "nfr_valid_idx" ON "nexthub_fx_rates" USING btree ("valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "no_party_id_type_idx" ON "nexthub_oracles" USING btree ("party_id_type");--> statement-breakpoint
CREATE INDEX "no_active_idx" ON "nexthub_oracles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "npc_consumer_idx" ON "nexthub_pisp_consents" USING btree ("consumer_id");--> statement-breakpoint
CREATE INDEX "npc_pisp_idx" ON "nexthub_pisp_consents" USING btree ("pisp_id");--> statement-breakpoint
CREATE INDEX "npc_state_idx" ON "nexthub_pisp_consents" USING btree ("state");--> statement-breakpoint
CREATE INDEX "vb_merchant_idx" ON "velocity_breaches" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "vb_breached_at_idx" ON "velocity_breaches" USING btree ("breached_at");--> statement-breakpoint
CREATE INDEX "vlc_merchant_channel_idx" ON "velocity_limit_configs" USING btree ("merchant_id","channel");--> statement-breakpoint
CREATE INDEX "vlc_active_idx" ON "velocity_limit_configs" USING btree ("is_active");