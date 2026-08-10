ALTER TABLE "admin_notification_prefs" ADD COLUMN "digest_frequency" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "consumer_notification_prefs" ADD COLUMN "digest_frequency" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "realtime_notification_preferences" ADD COLUMN "digest_frequency" text DEFAULT 'daily' NOT NULL;