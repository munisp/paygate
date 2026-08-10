CREATE TABLE "consumer_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "co_status_idx" ON "consumer_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "co_aggregate_idx" ON "consumer_outbox" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "co_created_idx" ON "consumer_outbox" USING btree ("created_at");