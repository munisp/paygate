CREATE TABLE "claim_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_key" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corridor_live_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_currency" text NOT NULL,
	"destination_currency" text NOT NULL,
	"source_country" text NOT NULL,
	"destination_country" text NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"volume_kobo" bigint DEFAULT 0 NOT NULL,
	"avg_fx_rate" real,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_rebalancing_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asset_type" text NOT NULL,
	"direction" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"target_allocation_pct" real NOT NULL,
	"current_allocation_pct" real NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "gnn_score" real;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "gnn_ring_detected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "gnn_scored_at" timestamp;--> statement-breakpoint
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_claim_id_user_insurance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."user_insurance_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corridor_live_stats" ADD CONSTRAINT "corridor_live_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_docs_claim_idx" ON "claim_documents" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_docs_user_idx" ON "claim_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corridor_live_tenant_idx" ON "corridor_live_stats" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "corridor_live_pair_idx" ON "corridor_live_stats" USING btree ("source_currency","destination_currency");--> statement-breakpoint
CREATE INDEX "rebalance_user_idx" ON "portfolio_rebalancing_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rebalance_status_idx" ON "portfolio_rebalancing_orders" USING btree ("status");