CREATE TABLE "pos_products" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"terminal_id" text,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"price_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"tax_percent" integer DEFAULT 0 NOT NULL,
	"stock_quantity" integer,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"barcode" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pos_products_merchant_idx" ON "pos_products" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pos_products_sku_merchant_idx" ON "pos_products" USING btree ("sku","merchant_id");--> statement-breakpoint
CREATE INDEX "pos_products_category_idx" ON "pos_products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "pos_products_barcode_idx" ON "pos_products" USING btree ("barcode");