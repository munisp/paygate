CREATE TABLE "emi_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"principal_kobo" bigint NOT NULL,
	"emi_kobo" bigint NOT NULL,
	"tenure_months" integer NOT NULL,
	"annual_rate_pct" integer DEFAULT 24 NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending_approval',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emi_repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"instalment_number" integer NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"payment_reference" text NOT NULL,
	"status" text DEFAULT 'completed',
	"paid_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_insurance_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"claim_type" text NOT NULL,
	"description" text NOT NULL,
	"claim_amount_kobo" bigint NOT NULL,
	"incident_date" text NOT NULL,
	"status" text DEFAULT 'submitted',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "emi_loans_user_idx" ON "emi_loans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "emi_loans_status_idx" ON "emi_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "emi_repay_loan_idx" ON "emi_repayments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "emi_repay_user_idx" ON "emi_repayments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "uic_policy_idx" ON "user_insurance_claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "uic_user_idx" ON "user_insurance_claims" USING btree ("user_id");