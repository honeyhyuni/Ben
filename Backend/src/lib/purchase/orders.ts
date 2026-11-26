import { createHash, randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { depositTransactions as ledger, purchaseOrders as orders, purchaseOrderItems as orderItems, purchaseCartItems as cartItems } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/types";
import { AppError } from "@/lib/http";
import { cartRows, lockAccount } from "./cart";
import { lockProduct } from "./products";
import { cents, decimal } from "./money";
import type { ListQuery, OrderInput } from "./schemas";

export async function placeOrder(auth: AuthContext, input: OrderInput) {
  const requestHash = createHash("sha256").update(JSON.stringify({ userId: auth.userId,
    ids: [...input.cartItemIds].sort(), total: decimal(cents(input.expectedTotal)), shipping: input.shippingMethod })).digest("hex");
  return getDb().transaction(async tx => {
    // Same account row lock as all existing deposit writes: no balance race.
    await lockAccount(tx, auth.accountId);
    const [prior] = await tx.select().from(orders).where(and(eq(orders.accountId, auth.accountId), eq(orders.requestKey, input.requestKey)));
    if (prior) {
      if (prior.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "같은 요청키에 다른 주문이 있습니다.");
      return prior;
    }
    const initial = (await cartRows(auth, tx)).filter(row => input.cartItemIds.includes(row.id));
    if (initial.length !== input.cartItemIds.length) throw new AppError(404, "CART_ITEM_NOT_FOUND", "본인 장바구니 항목만 주문할 수 있습니다.");
    // Stable lock order avoids deadlocks with concurrent product changes.
    for (const id of [...new Set(initial.map(r => r.product.id))].sort()) await lockProduct(tx, id);
    const selected = (await cartRows(auth, tx)).filter(row => input.cartItemIds.includes(row.id));
    const quantities = new Map<string, number>();
    let total = BigInt(0);
    for (const row of selected) {
      if (!row.product.active || !row.variant.active) throw new AppError(409, "PRODUCT_UNAVAILABLE", "판매 중지된 상품 또는 옵션이 있습니다.");
      quantities.set(row.product.id, (quantities.get(row.product.id) ?? 0) + row.quantity);
      total += cents(row.product.unitPrice) * BigInt(row.quantity);
    }
    for (const row of selected) if (quantities.get(row.product.id)! < row.product.moq)
      throw new AppError(409, "MOQ_NOT_MET", `${row.product.productNumber} 최소 수량은 ${row.product.moq}개입니다.`);
    if (total !== cents(input.expectedTotal)) throw new AppError(409, "PRICE_CHANGED", "최신 금액을 확인하고 다시 주문해 주세요.");
    const [balance] = await tx.select({ value: sql<string>`coalesce(sum(${ledger.amount}),0)::text` }).from(ledger).where(eq(ledger.accountId, auth.accountId));
    if (cents(balance.value) < total) throw new AppError(409, "INSUFFICIENT_BALANCE", "예치금이 부족합니다.");
    const [order] = await tx.insert(orders).values({ orderCode: `PO-${randomUUID()}`, accountId: auth.accountId, createdBy: auth.userId,
      total: decimal(total), shippingMethod: input.shippingMethod, requestKey: input.requestKey, requestHash }).returning();
    await tx.insert(orderItems).values(selected.map(row => ({ orderId: order.id, productId: row.product.id, variantId: row.variant.id,
      quantity: row.quantity, amount: decimal(cents(row.product.unitPrice) * BigInt(row.quantity)), note: row.note,
      snapshot: { market: row.product.market, shopNumber: row.product.shopNumber, productNumber: row.product.productNumber,
        color: row.variant.color, size: row.variant.size, colorHex: row.variant.colorHex, unitPrice: row.product.unitPrice,
        leadTime: row.product.leadTime, memo: row.product.memo } })));
    await tx.insert(ledger).values({ accountId: auth.accountId, createdBy: auth.userId, amount: decimal(-total),
      description: "사입 상품 주문", orderCode: order.orderCode, occurredOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
      requestKey: randomUUID() });
    await tx.delete(cartItems).where(inArray(cartItems.id, selected.map(row => row.id)));
    return order;
  });
}

export async function listOrders(query: ListQuery, accountId?: string) {
  const where = accountId ? eq(orders.accountId, accountId) : undefined;
  const [items, totals] = await Promise.all([
    getDb().select({ id: orders.id, orderCode: orders.orderCode, accountId: orders.accountId, createdBy: orders.createdBy,
      total: orders.total, shippingMethod: orders.shippingMethod, status: orders.status, createdAt: orders.createdAt }).from(orders)
      .where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    getDb().select({ total: count() }).from(orders).where(where),
  ]);
  return { items, total: totals[0].total, page: query.page, pageSize: query.pageSize };
}
export async function orderDetail(id: string, accountId?: string) {
  const [order] = await getDb().select().from(orders).where(and(eq(orders.id, id), accountId ? eq(orders.accountId, accountId) : undefined));
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "주문이 없습니다.");
  const items = await getDb().select().from(orderItems).where(eq(orderItems.orderId, id));
  const { requestHash: _hash, ...result } = order;
  void _hash;
  return { ...result, currency: "CNY", shippingFeeStatus: "NOT_CALCULATED", items };
}
