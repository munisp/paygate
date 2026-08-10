ALTER TABLE "tenants" ADD COLUMN "favicon_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "secondary_color" text DEFAULT '#a78bfa';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "footer_text" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "support_email" text;