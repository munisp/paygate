CREATE TABLE "idempotency_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_key_merchant_idx" ON "idempotency_requests" USING btree ("id","merchant_id");--> statement-breakpoint
CREATE INDEX "idempotency_operation_idx" ON "idempotency_requests" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_requests" USING btree ("expires_at");