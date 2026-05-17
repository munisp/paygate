CREATE TABLE "accessibility_fallback_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"submission_id" text,
	"reason" text NOT NULL,
	"review_status" text DEFAULT 'pending',
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scuml_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"verification_id" text,
	"entity_name" text NOT NULL,
	"rc_number" text,
	"check_type" text NOT NULL,
	"status" text DEFAULT 'pending',
	"scuml_ref" text,
	"flag_reason" text,
	"checked_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locale_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"locale" text DEFAULT 'en-NG' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	"date_format" text DEFAULT 'DD/MM/YYYY' NOT NULL,
	"number_format" text DEFAULT '1,234.56' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_locale_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE INDEX "a11y_fallback_merchant_idx" ON "accessibility_fallback_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "a11y_fallback_status_idx" ON "accessibility_fallback_sessions" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "scuml_merchant_idx" ON "scuml_checks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "scuml_status_idx" ON "scuml_checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scuml_expires_idx" ON "scuml_checks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "locale_user_idx" ON "user_locale_preferences" USING btree ("user_id");