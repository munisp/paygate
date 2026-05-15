ALTER TABLE "admin_notification_prefs" ADD COLUMN "login_anomaly_window_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_notification_prefs" ADD COLUMN "login_anomaly_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "keycloak_events" ADD COLUMN "geo_anomaly_acknowledged" boolean DEFAULT false;