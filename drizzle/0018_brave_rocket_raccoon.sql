CREATE TYPE "public"."restaurant_order_status" AS ENUM('open', 'sent_to_kitchen', 'ready', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."restaurant_table_status" AS ENUM('available', 'occupied', 'reserved', 'cleaning');--> statement-breakpoint
CREATE TABLE "agent_network" (
	"id" serial PRIMARY KEY NOT NULL,
	"super_agent_merchant_id" text NOT NULL,
	"sub_agent_merchant_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"total_volume_kobo" bigint DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"fraud_incidents" integer DEFAULT 0 NOT NULL,
	"settlement_rate" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geofence_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"terminal_id" text,
	"name" text NOT NULL,
	"center_lat" integer NOT NULL,
	"center_lng" integer NOT NULL,
	"radius_meters" integer DEFAULT 500 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 10 NOT NULL,
	"cost_per_unit" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"order_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kds_stations" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" integer NOT NULL,
	"points_balance" bigint DEFAULT 0 NOT NULL,
	"lifetime_points" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"points_per_kobo" integer DEFAULT 1 NOT NULL,
	"redeem_rate" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_programs_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"type" text NOT NULL,
	"points" bigint NOT NULL,
	"order_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_kobo" bigint NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_kobo" bigint DEFAULT 0 NOT NULL,
	"staff_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"quantity_per_serving" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"name" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price_kobo" bigint NOT NULL,
	"course_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "restaurant_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"table_id" text,
	"status" "restaurant_order_status" DEFAULT 'open' NOT NULL,
	"covers" integer DEFAULT 1 NOT NULL,
	"total_kobo" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"table_number" text NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"section" text DEFAULT 'main' NOT NULL,
	"status" "restaurant_table_status" DEFAULT 'available' NOT NULL,
	"pos_x" integer DEFAULT 0 NOT NULL,
	"pos_y" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_bill_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"total_kobo" bigint NOT NULL,
	"split_count" integer NOT NULL,
	"paid_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_bill_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"share_kobo" bigint NOT NULL,
	"payment_link_id" text,
	"paid_at" timestamp,
	"share_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'server' NOT NULL,
	"hourly_rate_kobo" bigint DEFAULT 0 NOT NULL,
	"bank_code" text,
	"account_number" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"clock_in" timestamp NOT NULL,
	"clock_out" timestamp,
	"tips_kobo" bigint DEFAULT 0 NOT NULL,
	"hours_worked" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_network_super_idx" ON "agent_network" USING btree ("super_agent_merchant_id");--> statement-breakpoint
CREATE INDEX "geofence_merchant_idx" ON "geofence_rules" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "inventory_merchant_idx" ON "inventory_items" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "inv_tx_item_idx" ON "inventory_transactions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "kds_merchant_idx" ON "kds_stations" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_account_merchant_idx" ON "loyalty_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_account_customer_idx" ON "loyalty_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_tx_account_idx" ON "loyalty_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "menu_cat_merchant_idx" ON "menu_categories" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "menu_item_cat_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "menu_item_merchant_idx" ON "menu_items" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payroll_merchant_idx" ON "payroll_runs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "recipe_menu_item_idx" ON "recipe_ingredients" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "restaurant_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "restaurant_order_merchant_idx" ON "restaurant_orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "restaurant_order_table_idx" ON "restaurant_orders" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "restaurant_table_merchant_idx" ON "restaurant_tables" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "split_bill_order_idx" ON "split_bill_sessions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "split_share_session_idx" ON "split_bill_shares" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "staff_merchant_idx" ON "staff_members" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "shift_staff_idx" ON "staff_shifts" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "shift_merchant_idx" ON "staff_shifts" USING btree ("merchant_id");