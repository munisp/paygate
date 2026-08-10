ALTER TABLE "merchants" ADD COLUMN "merchant_code" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "ussd_pin" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_merchant_code_unique" UNIQUE("merchant_code");