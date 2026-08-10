ALTER TABLE "tenants" ADD COLUMN "accent_color" text DEFAULT '#8b5cf6';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "font_family" text DEFAULT 'Inter';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "custom_domain" text;