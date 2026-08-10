CREATE TYPE "public"."ussd_status" AS ENUM('active', 'completed', 'failed', 'timeout');--> statement-breakpoint
CREATE TABLE "ussd_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text DEFAULT 'ten_default' NOT NULL,
	"session_id" text NOT NULL,
	"msisdn" text NOT NULL,
	"service_code" text DEFAULT '*737*1#' NOT NULL,
	"status" "ussd_status" DEFAULT 'active' NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"last_input" text,
	"amount_kobo" integer,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ussd_sessions" ADD CONSTRAINT "ussd_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ussd_merchant_idx" ON "ussd_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ussd_session_id_idx" ON "ussd_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ussd_msisdn_idx" ON "ussd_sessions" USING btree ("msisdn");