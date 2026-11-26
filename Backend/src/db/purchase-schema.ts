import { boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts, users } from "./schema";

export const purchaseProducts = pgTable("purchase_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  market: text("market").notNull(),
  shopNumber: text("shop_number").notNull(),
  productNumber: text("product_number").notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
  moq: integer("moq").notNull().default(1),
  leadTime: text("lead_time"),
  memo: text("memo"),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("purchase_product_identity").on(t.market, t.shopNumber, t.productNumber),
  check("purchase_price_positive", sql`${t.unitPrice} > 0`), check("purchase_moq_positive", sql`${t.moq} > 0`)]);

export const purchaseVariants = pgTable("purchase_product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => purchaseProducts.id),
  color: text("color").notNull(),
  colorHex: text("color_hex"),
  size: text("size").notNull(),
  active: boolean("active").notNull().default(true),
}, t => [uniqueIndex("purchase_variant_identity").on(t.productId, t.color, t.size)]);

export const purchaseImages = pgTable("purchase_product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => purchaseProducts.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  contentType: text("content_type").notNull(),
  contentBase64: text("content_base64").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
}, t => [index("purchase_images_product_idx").on(t.productId)]);

export const purchaseCarts = pgTable("purchase_carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  userId: uuid("user_id").notNull().references(() => users.id),
}, t => [uniqueIndex("purchase_cart_owner").on(t.accountId, t.userId)]);

export const purchaseCartItems = pgTable("purchase_cart_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id").notNull().references(() => purchaseCarts.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").notNull().references(() => purchaseVariants.id),
  quantity: integer("quantity").notNull(),
  note: text("note").notNull().default(""),
}, t => [uniqueIndex("purchase_cart_variant").on(t.cartId, t.variantId), check("purchase_quantity_positive", sql`${t.quantity} > 0 AND ${t.quantity} <= 100000`)]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderCode: text("order_code").notNull().unique(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  total: numeric("total", { precision: 18, scale: 2 }).notNull(),
  shippingMethod: text("shipping_method").notNull(),
  status: text("status").notNull().default("PLACED"),
  requestKey: uuid("request_key").notNull(),
  requestHash: text("request_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("purchase_order_request").on(t.accountId, t.requestKey), index("purchase_orders_account_idx").on(t.accountId)]);

export type PurchaseSnapshot = {
  market: string; shopNumber: string; productNumber: string;
  color: string; size: string; colorHex: string | null; unitPrice: string;
  leadTime: string | null; memo: string | null;
};
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => purchaseOrders.id),
  variantId: uuid("variant_id").notNull().references(() => purchaseVariants.id),
  productId: uuid("product_id").notNull().references(() => purchaseProducts.id),
  quantity: integer("quantity").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  note: text("note").notNull(),
  snapshot: jsonb("snapshot").$type<PurchaseSnapshot>().notNull(),
}, t => [index("purchase_order_items_order_idx").on(t.orderId)]);
