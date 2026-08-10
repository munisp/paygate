CREATE TABLE "fraud_alert_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fraud_alert_comments" ADD CONSTRAINT "fraud_alert_comments_alert_id_fraud_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."fraud_alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alert_comments" ADD CONSTRAINT "fraud_alert_comments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fac_alert_idx" ON "fraud_alert_comments" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "fac_merchant_idx" ON "fraud_alert_comments" USING btree ("merchant_id");