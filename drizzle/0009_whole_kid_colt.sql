CREATE TABLE "nip_resolution_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"bank_code" varchar(10) NOT NULL,
	"account_number" varchar(10) NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"error_source" varchar(50) DEFAULT 'nibss',
	"resolved_at" timestamp,
	"resolved_account_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "nip_errors_tenant_idx" ON "nip_resolution_errors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "nip_errors_merchant_idx" ON "nip_resolution_errors" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nip_errors_bank_account_idx" ON "nip_resolution_errors" USING btree ("bank_code","account_number");--> statement-breakpoint
CREATE INDEX "nip_errors_created_idx" ON "nip_resolution_errors" USING btree ("created_at");