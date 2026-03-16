CREATE TABLE "reconciliation_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"currency" text NOT NULL,
	"pg_balance" bigint NOT NULL,
	"tb_balance" bigint NOT NULL,
	"delta" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "recon_alert_merchant_idx" ON "reconciliation_alerts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "recon_alert_status_idx" ON "reconciliation_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recon_alert_created_idx" ON "reconciliation_alerts" USING btree ("created_at");