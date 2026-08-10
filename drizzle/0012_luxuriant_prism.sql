CREATE TABLE "merchant_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"entity_id" varchar(64),
	"entity_type" varchar(32),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notif_merchant_idx" ON "merchant_notifications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "notif_merchant_read_idx" ON "merchant_notifications" USING btree ("merchant_id","is_read");--> statement-breakpoint
CREATE INDEX "notif_created_idx" ON "merchant_notifications" USING btree ("created_at");