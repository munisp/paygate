CREATE TABLE "fraud_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"condition_tree" text DEFAULT '{}' NOT NULL,
	"actions" text DEFAULT '[]' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_key" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_v3_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"member_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"reward_tier" text NOT NULL,
	"points_redeemed" integer NOT NULL,
	"points_balance_before" integer NOT NULL,
	"points_balance_after" integer NOT NULL,
	"naira_value" integer DEFAULT 0 NOT NULL,
	"redemption_code" text NOT NULL,
	"pin_verified" integer DEFAULT false NOT NULL,
	"kafka_event_id" text,
	"kafka_event_status" text DEFAULT 'pending' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"confirmed_at" timestamp,
	"fulfilled_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_v3_redemptions_redemption_code_unique" UNIQUE("redemption_code")
);
--> statement-breakpoint
CREATE INDEX "fraud_rule_merchant_idx" ON "fraud_rules" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fraud_rule_status_idx" ON "fraud_rules" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "kyb_doc_verification_idx" ON "kyb_documents" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "kyb_doc_merchant_idx" ON "kyb_documents" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_redemption_program_idx" ON "loyalty_v3_redemptions" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_redemption_member_idx" ON "loyalty_v3_redemptions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_redemption_merchant_idx" ON "loyalty_v3_redemptions" USING btree ("merchant_id");