CREATE TABLE "keycloak_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"realm_id" text,
	"client_id" text,
	"user_id" text,
	"session_id" text,
	"ip_address" text,
	"error" text,
	"details" jsonb,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "keycloak_events_type_idx" ON "keycloak_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "keycloak_events_user_idx" ON "keycloak_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "keycloak_events_received_idx" ON "keycloak_events" USING btree ("received_at");