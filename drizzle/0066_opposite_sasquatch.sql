CREATE TABLE "fx_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"pair" text NOT NULL,
	"direction" text NOT NULL,
	"threshold" real NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fx_alerts" ADD CONSTRAINT "fx_alerts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fx_alerts_merchant_idx" ON "fx_alerts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fx_alerts_active_idx" ON "fx_alerts" USING btree ("active");