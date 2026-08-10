CREATE TABLE "nip_name_enquiry_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_nip_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"bank_verification_number" text,
	"kyc_level" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nip_virtual_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"payment_link_id" text,
	"checkout_session_id" text,
	"bank_nip_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"amount_expected" integer,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"paid_amount" integer,
	"nibss_reference" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nip_virtual_accounts_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "nip_name_enquiry_cache_key_idx" ON "nip_name_enquiry_cache" USING btree ("bank_nip_code","account_number");--> statement-breakpoint
CREATE INDEX "nip_name_enquiry_cache_expires_idx" ON "nip_name_enquiry_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nip_va_merchant_idx" ON "nip_virtual_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nip_va_reference_idx" ON "nip_virtual_accounts" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "nip_va_status_idx" ON "nip_virtual_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "nip_va_expires_idx" ON "nip_virtual_accounts" USING btree ("expires_at");