CREATE TABLE "api_rate_limit_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"limit_per_minute" integer DEFAULT 60 NOT NULL,
	"limit_per_hour" integer DEFAULT 1000 NOT NULL,
	"limit_per_day" integer DEFAULT 10000 NOT NULL,
	"burst_limit" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"ip_address" text,
	"user_agent" text,
	"request_body" text,
	"response_status" integer,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_check_results" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"check_type" text NOT NULL,
	"check_name" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"findings" text,
	"recommendations" text,
	"evaluated_at" timestamp DEFAULT now(),
	"next_evaluation_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dfsp_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text,
	"institution_name" text NOT NULL,
	"institution_type" text NOT NULL,
	"cbn_license_number" text,
	"cbn_license_doc_url" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"technical_contact_email" text,
	"fspop_endpoint" text,
	"tls_cert_url" text,
	"jwks_url" text,
	"settlement_account_number" text,
	"settlement_bank_code" text,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 6 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_regulators" (
	"id" text PRIMARY KEY NOT NULL,
	"regulator_code" text NOT NULL,
	"regulator_name" text NOT NULL,
	"jurisdiction" text DEFAULT 'NG' NOT NULL,
	"regulatory_type" text DEFAULT 'central_bank' NOT NULL,
	"contact_email" text,
	"reporting_frequency" text DEFAULT 'daily' NOT NULL,
	"data_access_level" text DEFAULT 'aggregate' NOT NULL,
	"api_endpoint" text,
	"webhook_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"onboarded_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_regulators_regulator_code_unique" UNIQUE("regulator_code")
);
--> statement-breakpoint
CREATE TABLE "pisp_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"pisp_id" text,
	"company_name" text NOT NULL,
	"cbn_license_number" text,
	"cbn_license_doc_url" text,
	"contact_email" text NOT NULL,
	"redirect_urls" text,
	"webhook_url" text,
	"consent_scope_requested" text,
	"business_description" text,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pos_operator_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"operator_name" text NOT NULL,
	"ptsp_code" text,
	"terminal_count" integer DEFAULT 1 NOT NULL,
	"deployment_locations" text,
	"nibss_approval_doc_url" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "psp_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"psp_id" text,
	"company_name" text NOT NULL,
	"psp_type" text DEFAULT 'acquirer' NOT NULL,
	"cbn_license_number" text,
	"pcidss_level" text,
	"pcidss_doc_url" text,
	"contact_email" text NOT NULL,
	"settlement_bank_code" text,
	"merchant_category_codes_allowed" text,
	"max_transaction_amount" double precision,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settlement_banks" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"nip_code" text,
	"swift_code" text,
	"cbn_license_number" text,
	"settlement_account_number" text,
	"settlement_account_name" text,
	"contact_email" text,
	"contact_phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_rtgs_enabled" boolean DEFAULT false NOT NULL,
	"is_nip_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "settlement_banks_bank_code_unique" UNIQUE("bank_code")
);
