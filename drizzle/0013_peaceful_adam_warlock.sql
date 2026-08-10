CREATE TABLE "device_push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(8) DEFAULT 'fcm' NOT NULL,
	"device_id" varchar(128),
	"app_version" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_tokens_merchant_idx" ON "device_push_tokens" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "device_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_tokens_token_idx" ON "device_push_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_device_unique" ON "device_push_tokens" USING btree ("user_id","device_id");