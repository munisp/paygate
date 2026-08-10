ALTER TABLE "device_push_tokens" ADD COLUMN "web_push_endpoint" text;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD COLUMN "web_push_p256dh" text;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD COLUMN "web_push_auth" text;