-- 0090_accounting_sync — S0 schema wave: accounting provider connections (QBO/Xero/Odoo),
-- sync run audit, and local↔remote entity mapping.
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS).

-- (a) accounting_connections — one row per (merchant, provider); tokens stored encrypted.
CREATE TABLE IF NOT EXISTS "accounting_connections" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "merchant_id" text NOT NULL,
  "provider" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "realm_id" varchar(128),
  "access_token_enc" text,
  "refresh_token_enc" text,
  "token_expires_at" timestamp,
  "scopes" text,
  "last_sync_at" timestamp,
  "sync_cursor" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_connections_merchant_provider_uniq" ON "accounting_connections" USING btree ("merchant_id", "provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_connections_merchant_idx" ON "accounting_connections" USING btree ("merchant_id");
--> statement-breakpoint

-- (b) accounting_sync_runs — audit of every push/pull execution.
CREATE TABLE IF NOT EXISTS "accounting_sync_runs" (
  "id" serial PRIMARY KEY,
  "connection_id" text NOT NULL,
  "direction" varchar(16) NOT NULL,
  "entity" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'running' NOT NULL,
  "records_in" integer DEFAULT 0,
  "records_out" integer DEFAULT 0,
  "error" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_sync_runs_connection_idx" ON "accounting_sync_runs" USING btree ("connection_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_sync_runs_connection_id_fk') THEN
    ALTER TABLE "accounting_sync_runs" ADD CONSTRAINT "accounting_sync_runs_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "accounting_connections"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint

-- (c) accounting_entity_map — local↔remote id mapping (idempotent pull via remote_id).
CREATE TABLE IF NOT EXISTS "accounting_entity_map" (
  "id" serial PRIMARY KEY,
  "connection_id" text NOT NULL,
  "entity" varchar(32) NOT NULL,
  "local_id" varchar(64) NOT NULL,
  "remote_id" varchar(128) NOT NULL,
  "remote_updated_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_entity_map_local_uniq" ON "accounting_entity_map" USING btree ("connection_id", "entity", "local_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_entity_map_remote_uniq" ON "accounting_entity_map" USING btree ("connection_id", "entity", "remote_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_entity_map_connection_id_fk') THEN
    ALTER TABLE "accounting_entity_map" ADD CONSTRAINT "accounting_entity_map_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "accounting_connections"("id") ON DELETE cascade;
  END IF;
END $$;
