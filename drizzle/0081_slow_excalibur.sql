CREATE TYPE "public"."checkout_session_status" AS ENUM('pending', 'completed', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_status" AS ENUM('unfulfilled', 'partial', 'fulfilled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_method_type" AS ENUM('card', 'bank_transfer', 'ussd', 'bnpl', 'usdc');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_kobo" bigint NOT NULL,
	"total_price_kobo" bigint NOT NULL,
	"product_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"consumer_id" text,
	"session_token" text,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"subtotal_kobo" bigint DEFAULT 0 NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"shipping_kobo" bigint DEFAULT 0 NOT NULL,
	"tax_kobo" bigint DEFAULT 0 NOT NULL,
	"total_kobo" bigint DEFAULT 0 NOT NULL,
	"coupon_code" text,
	"notes" text,
	"expires_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chargeback_evidence_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"chargeback_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"evidence_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_key" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"submitted_to_scheme" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chargeback_timeline" (
	"id" text PRIMARY KEY NOT NULL,
	"chargeback_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event" text NOT NULL,
	"previous_state" text,
	"new_state" text NOT NULL,
	"actor_id" text,
	"actor_type" text DEFAULT 'system' NOT NULL,
	"notes" text,
	"scheme_ref" text,
	"deadline_at" timestamp,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"consumer_id" text,
	"status" "checkout_session_status" DEFAULT 'pending' NOT NULL,
	"payment_method" "payment_method_type",
	"payment_intent_id" text,
	"stripe_client_secret" text,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"shipping_name" text,
	"shipping_phone" text,
	"shipping_email" text,
	"shipping_line1" text,
	"shipping_line2" text,
	"shipping_city" text,
	"shipping_state" text,
	"shipping_country" text DEFAULT 'NG',
	"shipping_postal_code" text,
	"billing_name" text,
	"billing_line1" text,
	"billing_city" text,
	"billing_state" text,
	"billing_country" text DEFAULT 'NG',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"temporal_workflow_id" text,
	"kafka_event_id" text,
	"tigerbeetle_transfer_id" bigint,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#4F46E5' NOT NULL,
	"background_color" text DEFAULT '#ffffff' NOT NULL,
	"text_color" text DEFAULT '#111827' NOT NULL,
	"accent_color" text DEFAULT '#10B981' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"border_radius" text DEFAULT '12' NOT NULL,
	"business_name" text,
	"tagline" text,
	"support_email" text,
	"support_phone" text,
	"custom_domain" text,
	"show_payment_methods" jsonb DEFAULT '["card","bank_transfer","ussd","bnpl"]'::jsonb,
	"show_order_summary" boolean DEFAULT true NOT NULL,
	"show_security_badge" boolean DEFAULT true NOT NULL,
	"require_billing_address" boolean DEFAULT false NOT NULL,
	"custom_css" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_themes_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "face_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"user_id" text,
	"submission_id" text,
	"embedding" jsonb NOT NULL,
	"model" text DEFAULT 'ArcFace' NOT NULL,
	"image_url" text,
	"image_type" text,
	"quality_score" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfilment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"tracking_number" text,
	"tracking_carrier" text,
	"tracking_url" text,
	"actor_id" text,
	"actor_type" text,
	"webhook_source" text,
	"kafka_offset" bigint,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_payment_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_link_id" text,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_email" text,
	"customer_name" text,
	"customer_phone" text,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"description" text,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"stripe_payment_intent_id" text,
	"stripe_client_secret" text,
	"nip_virtual_account_number" text,
	"nip_bank_code" text,
	"nip_bank_name" text,
	"nip_session_id" text,
	"nip_expires_at" timestamp,
	"ussd_code" text,
	"ussd_reference" text,
	"ussd_bank_code" text,
	"bnpl_provider" text,
	"bnpl_installment_kobo" bigint,
	"bnpl_installment_count" integer,
	"bnpl_plan_id" text,
	"bnpl_approval_url" text,
	"usdc_wallet_address" text,
	"usdc_amount_usdc" real,
	"usdc_network" text DEFAULT 'ethereum',
	"paid_at" timestamp,
	"failed_at" timestamp,
	"failure_reason" text,
	"tigerbeetle_transfer_id" bigint,
	"temporal_workflow_id" text,
	"kafka_event_id" text,
	"webhook_delivered_at" timestamp,
	"webhook_attempts" integer DEFAULT 0 NOT NULL,
	"receipt_email_sent_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_payment_sessions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "interchange_fee_records" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"scheme" text NOT NULL,
	"card_type" text,
	"channel" text NOT NULL,
	"transaction_amount_kobo" bigint NOT NULL,
	"fee_kobo" bigint NOT NULL,
	"percentage_fee_kobo" bigint NOT NULL,
	"fixed_fee_kobo" bigint NOT NULL,
	"basis_points" integer NOT NULL,
	"settled_at" timestamp,
	"billing_period" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interchange_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"scheme" text NOT NULL,
	"card_type" text NOT NULL,
	"channel" text NOT NULL,
	"mcc" text,
	"basis_points" integer NOT NULL,
	"fixed_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"min_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"max_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"effective_from" timestamp NOT NULL,
	"effective_to" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'cbn_schedule' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keycloak_role_sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"action" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "mojaloop_parties" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"party_id_type" text NOT NULL,
	"party_identifier" text NOT NULL,
	"fsp_id" text,
	"display_name" text,
	"lookup_status" text DEFAULT 'found' NOT NULL,
	"raw_response" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mojaloop_parties_merchant_party_unique" UNIQUE("merchant_id","party_identifier")
);
--> statement-breakpoint
CREATE TABLE "mojaloop_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"payer_id_type" text NOT NULL,
	"payer_id_value" text NOT NULL,
	"payee_id_type" text NOT NULL,
	"payee_id_value" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"ilp_packet" text,
	"condition" text,
	"expiration" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mojaloop_quotes_quote_id_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
CREATE TABLE "mojaloop_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"quote_id" text,
	"merchant_id" text NOT NULL,
	"payer_fsp_id" text,
	"payee_fsp_id" text,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"transfer_state" text DEFAULT 'RESERVED' NOT NULL,
	"ilp_packet" text,
	"condition" text,
	"expiration" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mojaloop_transfers_transfer_id_unique" UNIQUE("transfer_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"quantity" integer NOT NULL,
	"unit_price_kobo" bigint NOT NULL,
	"total_price_kobo" bigint NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"tax_kobo" bigint DEFAULT 0 NOT NULL,
	"fulfilment_status" "fulfilment_status" DEFAULT 'unfulfilled' NOT NULL,
	"product_snapshot" jsonb,
	"refunded_qty" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"consumer_id" text,
	"checkout_session_id" text,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"fulfilment_status" "fulfilment_status" DEFAULT 'unfulfilled' NOT NULL,
	"payment_method" "payment_method_type",
	"payment_intent_id" text,
	"paid_at" timestamp,
	"subtotal_kobo" bigint NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"shipping_kobo" bigint DEFAULT 0 NOT NULL,
	"tax_kobo" bigint DEFAULT 0 NOT NULL,
	"total_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"refunded_kobo" bigint DEFAULT 0 NOT NULL,
	"shipping_name" text,
	"shipping_phone" text,
	"shipping_email" text,
	"shipping_line1" text,
	"shipping_line2" text,
	"shipping_city" text,
	"shipping_state" text,
	"shipping_country" text DEFAULT 'NG',
	"shipping_postal_code" text,
	"tracking_number" text,
	"tracking_carrier" text,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"temporal_workflow_id" text,
	"kafka_event_id" text,
	"tigerbeetle_transfer_id" bigint,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"title" text NOT NULL,
	"sku" text,
	"price_kobo" bigint NOT NULL,
	"compare_price_kobo" bigint,
	"inventory_qty" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"options" jsonb DEFAULT '{}'::jsonb,
	"weight" real,
	"barcode" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"price_kobo" bigint NOT NULL,
	"compare_price_kobo" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"sku" text,
	"barcode" text,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"inventory_qty" integer DEFAULT 0 NOT NULL,
	"weight" real,
	"weight_unit" text DEFAULT 'kg',
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"category" text,
	"taxable" boolean DEFAULT true NOT NULL,
	"tax_code" text,
	"requires_shipping" boolean DEFAULT true NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_report_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"form_type" text NOT NULL,
	"period" text NOT NULL,
	"submission_method" text DEFAULT 'api' NOT NULL,
	"submission_endpoint" text,
	"http_status" integer,
	"response_body" text,
	"regulator_ref" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp,
	"status" text DEFAULT 'submitted' NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"file_key" text,
	"file_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"scheme" text NOT NULL,
	"membership_type" text DEFAULT 'principal' NOT NULL,
	"member_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"effective_from" timestamp NOT NULL,
	"renewal_date" timestamp,
	"contact_email" text,
	"compliance_officer" text,
	"bin_ranges" text,
	"sponsored_merchants" text,
	"annual_fee_usd" integer,
	"last_renewal_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_audit_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"overall_score" integer NOT NULL,
	"findings" jsonb NOT NULL,
	"triggered_by" text DEFAULT 'heartbeat',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "str_records" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"str_type" text DEFAULT 'STR' NOT NULL,
	"subject_type" text DEFAULT 'INDIVIDUAL' NOT NULL,
	"subject_data" text NOT NULL,
	"transaction_data" text NOT NULL,
	"suspicion_grounds" text NOT NULL,
	"suspicion_type" text DEFAULT 'MONEY_LAUNDERING' NOT NULL,
	"suspicion_indicators" text,
	"narrative" text NOT NULL,
	"action_taken" text,
	"filed_by" text NOT NULL,
	"filed_at" timestamp DEFAULT now() NOT NULL,
	"nfiu_ref" text,
	"nfiu_submitted_at" timestamp,
	"nfiu_acknowledged_at" timestamp,
	"submission_status" text DEFAULT 'pending' NOT NULL,
	"submission_attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"last_error" text,
	"deadline_at" timestamp NOT NULL,
	"deadline_breached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "vb_merchant_idx";--> statement-breakpoint
DROP INDEX "vb_breached_at_idx";--> statement-breakpoint
DROP INDEX "vlc_merchant_channel_idx";--> statement-breakpoint
DROP INDEX "vlc_active_idx";--> statement-breakpoint
ALTER TABLE "velocity_breaches" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ALTER COLUMN "limit_config_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ALTER COLUMN "merchant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ALTER COLUMN "channel" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "merchant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "merchant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "channel" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "channel" SET DEFAULT 'all';--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "limit_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "limit_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "is_active" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "transaction_id" text;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "breach_type" text DEFAULT 'limit_exceeded' NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "current_count" integer;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "current_amount_kobo" bigint;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "limit_count" integer;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "limit_amount_kobo" bigint;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "transaction_amount_kobo" bigint;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "action" text DEFAULT 'blocked' NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "velocity_breaches" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "max_count" integer;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "max_amount_kobo" bigint;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "single_tx_max_kobo" bigint;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "currency" text DEFAULT 'NGN' NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "risk_tier" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "effective_from" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "effective_to" timestamp;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "set_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfilment_events" ADD CONSTRAINT "fulfilment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_items_product_idx" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "carts_merchant_idx" ON "carts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "carts_consumer_idx" ON "carts" USING btree ("consumer_id");--> statement-breakpoint
CREATE INDEX "carts_session_idx" ON "carts" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "cb_evidence_chargeback_idx" ON "chargeback_evidence_packages" USING btree ("chargeback_id");--> statement-breakpoint
CREATE INDEX "cb_evidence_merchant_idx" ON "chargeback_evidence_packages" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cb_timeline_chargeback_idx" ON "chargeback_timeline" USING btree ("chargeback_id");--> statement-breakpoint
CREATE INDEX "cb_timeline_merchant_idx" ON "chargeback_timeline" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cb_timeline_occurred_idx" ON "chargeback_timeline" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "checkout_sessions_cart_idx" ON "checkout_sessions" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_merchant_idx" ON "checkout_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_status_idx" ON "checkout_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checkout_sessions_payment_intent_idx" ON "checkout_sessions" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "checkout_themes_merchant_idx" ON "checkout_themes" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "checkout_themes_tenant_idx" ON "checkout_themes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "face_embed_merchant_idx" ON "face_embeddings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "face_embed_user_idx" ON "face_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "face_embed_submission_idx" ON "face_embeddings" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "face_embed_model_idx" ON "face_embeddings" USING btree ("model");--> statement-breakpoint
CREATE INDEX "fulfilment_events_order_idx" ON "fulfilment_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "fulfilment_events_merchant_idx" ON "fulfilment_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fulfilment_events_type_idx" ON "fulfilment_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "hps_merchant_idx" ON "hosted_payment_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "hps_status_idx" ON "hosted_payment_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hps_reference_idx" ON "hosted_payment_sessions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "hps_payment_link_idx" ON "hosted_payment_sessions" USING btree ("payment_link_id");--> statement-breakpoint
CREATE INDEX "hps_stripe_pi_idx" ON "hosted_payment_sessions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "hps_nip_va_idx" ON "hosted_payment_sessions" USING btree ("nip_virtual_account_number");--> statement-breakpoint
CREATE INDEX "interchange_fee_tx_idx" ON "interchange_fee_records" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "interchange_fee_merchant_idx" ON "interchange_fee_records" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "interchange_fee_period_idx" ON "interchange_fee_records" USING btree ("billing_period");--> statement-breakpoint
CREATE INDEX "interchange_fee_scheme_idx" ON "interchange_fee_records" USING btree ("scheme");--> statement-breakpoint
CREATE INDEX "interchange_scheme_channel_idx" ON "interchange_schedule" USING btree ("scheme","channel");--> statement-breakpoint
CREATE INDEX "interchange_scheme_card_idx" ON "interchange_schedule" USING btree ("scheme","card_type");--> statement-breakpoint
CREATE INDEX "interchange_active_idx" ON "interchange_schedule" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "kc_role_sync_user_idx" ON "keycloak_role_sync_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kc_role_sync_action_idx" ON "keycloak_role_sync_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "mojaloop_parties_merchant_idx" ON "mojaloop_parties" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mojaloop_quotes_merchant_idx" ON "mojaloop_quotes" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mojaloop_transfers_merchant_idx" ON "mojaloop_transfers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mojaloop_transfers_state_idx" ON "mojaloop_transfers" USING btree ("transfer_state");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_merchant_idx" ON "orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_idx" ON "orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_consumer_idx" ON "orders" USING btree ("consumer_id");--> statement-breakpoint
CREATE INDEX "orders_payment_intent_idx" ON "orders" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_merchant_idx" ON "products" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "products_tenant_idx" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "reg_submission_report_idx" ON "regulatory_report_submissions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "reg_submission_merchant_idx" ON "regulatory_report_submissions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "reg_submission_form_idx" ON "regulatory_report_submissions" USING btree ("form_type");--> statement-breakpoint
CREATE INDEX "reg_submission_period_idx" ON "regulatory_report_submissions" USING btree ("period");--> statement-breakpoint
CREATE INDEX "reg_submission_status_idx" ON "regulatory_report_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheme_membership_scheme_idx" ON "scheme_memberships" USING btree ("scheme");--> statement-breakpoint
CREATE INDEX "scheme_membership_status_idx" ON "scheme_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sec_audit_merchant_idx" ON "security_audit_snapshots" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sec_audit_created_idx" ON "security_audit_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "str_merchant_idx" ON "str_records" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "str_transaction_idx" ON "str_records" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "str_status_idx" ON "str_records" USING btree ("submission_status");--> statement-breakpoint
CREATE INDEX "str_deadline_idx" ON "str_records" USING btree ("deadline_at");--> statement-breakpoint
CREATE INDEX "str_filed_at_idx" ON "str_records" USING btree ("filed_at");--> statement-breakpoint
CREATE INDEX "breach_merchant_idx" ON "velocity_breaches" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "breach_tx_idx" ON "velocity_breaches" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "breach_created_idx" ON "velocity_breaches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "velocity_merchant_channel_idx" ON "velocity_limit_configs" USING btree ("merchant_id","channel");--> statement-breakpoint
CREATE INDEX "velocity_merchant_active_idx" ON "velocity_limit_configs" USING btree ("merchant_id","is_active");--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" DROP COLUMN "max_value";--> statement-breakpoint
ALTER TABLE "velocity_limit_configs" DROP COLUMN "description";