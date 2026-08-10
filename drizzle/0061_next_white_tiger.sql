ALTER TABLE "pos_products" ALTER COLUMN "track_inventory" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "pos_products" ALTER COLUMN "is_active" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "pos_products" ALTER COLUMN "is_active" SET DEFAULT true;