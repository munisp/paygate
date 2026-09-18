CREATE TABLE IF NOT EXISTS "sip_plans" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asset_type" varchar NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"frequency" varchar DEFAULT 'monthly' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"next_execution_at" timestamp NOT NULL,
	"total_invested_kobo" bigint DEFAULT 0,
	"execution_count" integer DEFAULT 0,
	"last_executed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sip_executions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"plan_id" varchar NOT NULL,
	"amount_kobo" bigint,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"executed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" varchar,
	"amount_ngn" numeric,
	"currency" varchar DEFAULT 'NGN',
	"interval" varchar DEFAULT 'monthly',
	"status" varchar DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispute_notes" (
	"id" varchar PRIMARY KEY NOT NULL,
	"dispute_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"author_id" varchar,
	"author_name" varchar,
	"note" text NOT NULL,
	"visibility" varchar DEFAULT 'internal',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" varchar PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" varchar NOT NULL,
	"contact_name" varchar,
	"email" varchar,
	"phone" varchar,
	"address" text,
	"payment_terms" varchar DEFAULT 'net30',
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "corridor_fx_markups" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_currency" varchar NOT NULL,
	"destination_currency" varchar NOT NULL,
	"markup_bps" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "corridor_fx_markups_pair_unique" UNIQUE("source_currency","destination_currency")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "corridor_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_currency" varchar NOT NULL,
	"destination_currency" varchar NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "corridor_config_pair_unique" UNIQUE("source_currency","destination_currency")
);
