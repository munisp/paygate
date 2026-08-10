ALTER TABLE "merchant_notifications" ADD COLUMN "priority" varchar(16) DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_notifications" ADD COLUMN "action_url" varchar(512);--> statement-breakpoint
ALTER TABLE "merchant_notifications" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "merchant_notifications" ADD COLUMN "dismissed_at" timestamp;--> statement-breakpoint
CREATE INDEX "notif_priority_idx" ON "merchant_notifications" USING btree ("merchant_id","priority");