ALTER TABLE "settlements" ADD COLUMN "severity" text DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "notes" text;