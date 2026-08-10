CREATE TABLE "bnpl_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"installments" integer DEFAULT 3 NOT NULL,
	"interest_rate" integer DEFAULT 0 NOT NULL,
	"min_amount" bigint DEFAULT 5000 NOT NULL,
	"max_amount" bigint DEFAULT 500000 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bnpl_plans" ADD CONSTRAINT "bnpl_plans_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bnpl_plan_merchant_idx" ON "bnpl_plans" USING btree ("merchant_id");