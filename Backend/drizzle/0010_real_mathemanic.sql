CREATE TABLE "purchase_cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "purchase_quantity_positive" CHECK ("purchase_cart_items"."quantity" > 0 AND "purchase_cart_items"."quantity" <= 100000)
);
--> statement-breakpoint
CREATE TABLE "purchase_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content_type" text NOT NULL,
	"content_base64" text NOT NULL,
	"size_bytes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"note" text NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_code" text NOT NULL,
	"account_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"shipping_method" text NOT NULL,
	"status" text DEFAULT 'PLACED' NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_order_code_unique" UNIQUE("order_code")
);
--> statement-breakpoint
CREATE TABLE "purchase_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" text NOT NULL,
	"shop_number" text NOT NULL,
	"product_number" text NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"moq" integer DEFAULT 1 NOT NULL,
	"lead_time" text,
	"memo" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_price_positive" CHECK ("purchase_products"."unit_price" > 0),
	CONSTRAINT "purchase_moq_positive" CHECK ("purchase_products"."moq" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"color" text NOT NULL,
	"color_hex" text,
	"size" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_cart_items" ADD CONSTRAINT "purchase_cart_items_cart_id_purchase_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."purchase_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_cart_items" ADD CONSTRAINT "purchase_cart_items_variant_id_purchase_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."purchase_product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_carts" ADD CONSTRAINT "purchase_carts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_carts" ADD CONSTRAINT "purchase_carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_product_images" ADD CONSTRAINT "purchase_product_images_product_id_purchase_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."purchase_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_purchase_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."purchase_product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_purchase_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."purchase_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_products" ADD CONSTRAINT "purchase_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_product_variants" ADD CONSTRAINT "purchase_product_variants_product_id_purchase_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."purchase_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_cart_variant" ON "purchase_cart_items" USING btree ("cart_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_cart_owner" ON "purchase_carts" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE INDEX "purchase_images_product_idx" ON "purchase_product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_request" ON "purchase_orders" USING btree ("account_id","request_key");--> statement-breakpoint
CREATE INDEX "purchase_orders_account_idx" ON "purchase_orders" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_product_identity" ON "purchase_products" USING btree ("market","shop_number","product_number");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_variant_identity" ON "purchase_product_variants" USING btree ("product_id","color","size");