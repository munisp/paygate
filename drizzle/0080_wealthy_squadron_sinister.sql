CREATE TABLE "regulator_magic_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"regulator_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "regulator_magic_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "regulator_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"regulator_id" text NOT NULL,
	"email" text NOT NULL,
	"session_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "regulator_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
ALTER TABLE "saga_instances" ADD COLUMN "workflow_id" text;--> statement-breakpoint
ALTER TABLE "saga_instances" ADD COLUMN "run_id" text;