CREATE TABLE "support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"merchant_id" text,
	"user_id" text,
	"role" text DEFAULT 'user' NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "support_session_idx" ON "support_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "support_merchant_idx" ON "support_messages" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "support_user_idx" ON "support_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_created_idx" ON "support_messages" USING btree ("created_at");