import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, purchaseCarts as carts, purchaseCartItems as items, purchaseVariants as variants, purchaseProducts as products } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/types";
import { AppError } from "@/lib/http";
import type { CartInput } from "./schemas";
import { cents, decimal } from "./money";
import { lockProduct } from "./products";

export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export async function lockAccount(tx: Tx, accountId: string) {
  const [account] = await tx.select({ active: accounts.active }).from(accounts).where(eq(accounts.id, accountId)).for("update");
  if (!account?.active) throw new AppError(403, "ACCOUNT_DISABLED", "고객사가 비활성 상태입니다.");
}
export async function cartRows(auth: AuthContext, db: Tx | ReturnType<typeof getDb> = getDb()) {
  return db.select({ id: items.id, quantity: items.quantity, note: items.note, variant: variants, product: products })
    .from(items).innerJoin(carts, eq(carts.id, items.cartId)).innerJoin(variants, eq(variants.id, items.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(carts.accountId, auth.accountId), eq(carts.userId, auth.userId))).orderBy(items.id);
}
export async function getCart(auth: AuthContext) {
  const rows = await cartRows(auth);
  return { items: rows.map(row => ({ ...row, available: row.variant.active && row.product.active,
    amount: decimal(cents(row.product.unitPrice) * BigInt(row.quantity)) })),
    total: decimal(rows.reduce((sum, row) => sum + cents(row.product.unitPrice) * BigInt(row.quantity), BigInt(0))),
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0), productCount: new Set(rows.map(r => r.product.id)).size, currency: "CNY" };
}
export async function putCartItem(auth: AuthContext, input: CartInput) {
  return getDb().transaction(async tx => {
    await lockAccount(tx, auth.accountId);
    const [before] = await tx.select().from(variants).where(eq(variants.id, input.variantId));
    if (!before) throw new AppError(404, "VARIANT_NOT_FOUND", "옵션이 없습니다.");
    const product = await lockProduct(tx, before.productId);
    const [variant] = await tx.select().from(variants).where(eq(variants.id, input.variantId));
    if (!product.active || !variant.active) throw new AppError(409, "PRODUCT_UNAVAILABLE", "판매 중지된 상품 또는 옵션입니다.");
    const [cart] = await tx.insert(carts).values({ accountId: auth.accountId, userId: auth.userId })
      .onConflictDoUpdate({ target: [carts.accountId, carts.userId], set: { userId: auth.userId } }).returning();
    const [prior] = await tx.select({ id: items.id }).from(items).where(and(eq(items.cartId, cart.id), eq(items.variantId, input.variantId)));
    if (!prior) {
      const rows = await tx.select({ id: items.id }).from(items).where(eq(items.cartId, cart.id)).limit(500);
      if (rows.length >= 500) throw new AppError(409, "CART_LIMIT", "장바구니는 최대 500개 옵션입니다.");
    }
    const [row] = await tx.insert(items).values({ cartId: cart.id, ...input }).onConflictDoUpdate({
      target: [items.cartId, items.variantId], set: { quantity: input.quantity, note: input.note },
    }).returning();
    return row;
  });
}
export async function removeCartItem(auth: AuthContext, id: string) {
  await getDb().transaction(async tx => {
    await lockAccount(tx, auth.accountId);
    const [cart] = await tx.select().from(carts).where(and(eq(carts.accountId, auth.accountId), eq(carts.userId, auth.userId)));
    if (!cart) throw new AppError(404, "CART_ITEM_NOT_FOUND", "장바구니 항목이 없습니다.");
    const removed = await tx.delete(items).where(and(eq(items.cartId, cart.id), eq(items.id, id))).returning({ id: items.id });
    if (!removed.length) throw new AppError(404, "CART_ITEM_NOT_FOUND", "장바구니 항목이 없습니다.");
  });
}
