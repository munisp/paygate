CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" text DEFAULT 'NGN' NOT NULL,
	"target_currency" text NOT NULL,
	"rate" text NOT NULL,
	"source" text DEFAULT 'exchangerate-api' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fx_rates_base_target_idx" ON "fx_rates" USING btree ("base_currency","target_currency");--> statement-breakpoint
CREATE INDEX "fx_rates_fetched_idx" ON "fx_rates" USING btree ("fetched_at");