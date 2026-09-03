CREATE TABLE "partner_tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"country" text DEFAULT 'NG',
	"plan" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"logo_url" text,
	"favicon_url" text,
	"primary_color" text DEFAULT '#6366f1',
	"secondary_color" text DEFAULT '#a78bfa',
	"accent_color" text DEFAULT '#8b5cf6',
	"font_family" text DEFAULT 'Inter',
	"custom_domain" text,
	"invite_code" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_by" text,
	"invited_at" timestamp,
	"joined_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_users_tenant_email_unique" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "tenant_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_email" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_partner_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."partner_tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_audit_logs" ADD CONSTRAINT "tenant_audit_logs_tenant_id_partner_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."partner_tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "partner_tenants_status_idx" ON "partner_tenants" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "partner_tenants_slug_idx" ON "partner_tenants" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "partner_tenants_custom_domain_idx" ON "partner_tenants" USING btree ("custom_domain");
--> statement-breakpoint
CREATE INDEX "tenant_users_tenant_idx" ON "tenant_users" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "tenant_users_email_idx" ON "tenant_users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "tenant_audit_logs_tenant_idx" ON "tenant_audit_logs" USING btree ("tenant_id");
