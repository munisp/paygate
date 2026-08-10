CREATE TABLE "anomaly_config_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"changed_by_user_id" integer NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"old_window_minutes" integer,
	"old_threshold" integer,
	"new_window_minutes" integer NOT NULL,
	"new_threshold" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anomaly_config_audit_user_idx" ON "anomaly_config_audit" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "anomaly_config_audit_changed_at_idx" ON "anomaly_config_audit" USING btree ("changed_at");