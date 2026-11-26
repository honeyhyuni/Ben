import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, accounts, accountMembers, depositTransactions as ledger, purchaseProducts, purchaseVariants, purchaseImages, purchaseCarts, purchaseOrders, purchaseOrderItems } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/types";
import { issueTokenPair } from "@/lib/auth/jwt";
import { createSession, revokeSession } from "@/lib/auth/session-store";
import { productInput } from "./schemas";
import { cents, decimal } from "./money";
import { createProducts, productDetail, updateProduct } from "./products";
import { getCart, putCartItem } from "./cart";
import { orderDetail, placeOrder } from "./orders";
import { uploadImage, deleteImage } from "./images";

it("validates custom options and exact decimal arithmetic", () => {
  expect(decimal(cents("0.10") + cents("0.20"))).toBe("0.30");
  expect(decimal(cents("-35.01"))).toBe("-35.01");
  const input = { market: "M", shopNumber: "S", productNumber: "P", unitPrice: "35", sizes: ["90", "직접입력"], colors: [{ name: "진청" }] };
  expect(productInput.parse(input).sizes).toEqual(["90", "직접입력"]);
  expect(productInput.safeParse({ ...input, sizes: ["F", " F "] }).success).toBe(false);
  expect(productInput.safeParse({ ...input, unitPrice: "-1" }).success).toBe(false);
});

describe.skipIf(process.env.BEN_PURCHASE_DB_TEST !== "1")("purchase database integration", () => {
  const userIds: string[] = [], accountIds: string[] = [], productIds: string[] = [], sessions: string[] = [];
  let main: AuthContext, sub: AuthContext, other: AuthContext, admin: AuthContext;
  beforeEach(async () => {
    process.loadEnvFile(".env.local");
    const db = getDb();
    async function actor(systemRole: "USER" | "SUPER_ADMIN", accountId?: string): Promise<AuthContext> {
      const [user] = await db.insert(users).values({ name: "purchase-test", systemRole }).returning(); userIds.push(user.id);
      let aid = accountId;
      if (!aid) {
        const [account] = await db.insert(accounts).values({ code: "test-" + randomUUID(), name: "purchase-test", ownerUserId: user.id }).returning();
        aid = account.id; accountIds.push(aid);
      }
      const [member] = await db.insert(accountMembers).values({ userId: user.id, accountId: aid, type: accountId ? "SUB" : "MAIN", role: accountId ? "MEMBER" : "OWNER" }).returning();
      return { userId: user.id, accountId: aid, memberId: member.id, memberType: member.type, role: member.role, sessionId: randomUUID() };
    }
    main = await actor("USER"); sub = await actor("USER", main.accountId); other = await actor("USER"); admin = await actor("SUPER_ADMIN");
  });
  afterEach(async () => {
    const db = getDb();
    for (const id of sessions.splice(0)) await revokeSession(id);
    const os = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(inArray(purchaseOrders.accountId, accountIds));
    if (os.length) await db.delete(purchaseOrderItems).where(inArray(purchaseOrderItems.orderId, os.map(o => o.id)));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.accountId, accountIds));
    await db.delete(purchaseCarts).where(inArray(purchaseCarts.accountId, accountIds));
    await db.delete(ledger).where(inArray(ledger.accountId, accountIds));
    if (productIds.length) {
      await db.delete(purchaseImages).where(inArray(purchaseImages.productId, productIds));
      await db.delete(purchaseVariants).where(inArray(purchaseVariants.productId, productIds));
      await db.delete(purchaseProducts).where(inArray(purchaseProducts.id, productIds));
    }
    await db.delete(accountMembers).where(inArray(accountMembers.accountId, accountIds));
    await db.delete(accounts).where(inArray(accounts.id, accountIds));
    await db.delete(users).where(inArray(users.id, userIds));
    userIds.length = accountIds.length = productIds.length = 0;
  });
  async function product(moq = 1) {
    const [p] = await createProducts(admin.userId, [productInput.parse({ market: "M", shopNumber: "S", productNumber: randomUUID(), unitPrice: "35.00", sizes: ["F"], colors: [{ name: "블랙" }, { name: "핑크" }], moq })]);
    productIds.push(p.id);
    return productDetail(p.id);
  }
  async function fund(amount: string) {
    await getDb().insert(ledger).values({ accountId: main.accountId, createdBy: admin.userId, amount, description: "test", occurredOn: "2026-11-25", requestKey: randomUUID() });
  }
  async function balance() {
    const [row] = await getDb().select({ amount: sql<string>`coalesce(sum(${ledger.amount}),0)::text` }).from(ledger).where(eq(ledger.accountId, main.accountId));
    return decimal(cents(row.amount));
  }
  it("orders selected rows as SUB, debits once under concurrent retries, preserves snapshots and unselected rows", async () => {
    const p = await product(); await fund("1000");
    const chosen = await putCartItem(sub, { variantId: p.variants[0].id, quantity: 2, note: "택 제거" });
    await putCartItem(sub, { variantId: p.variants[1].id, quantity: 1, note: "" });
    const input = { requestKey: randomUUID(), cartItemIds: [chosen.id], expectedTotal: "70.00", shippingMethod: "SEA" as const };
    const results = await Promise.all([placeOrder(sub, input), placeOrder(sub, input)]);
    expect(results[0].id).toBe(results[1].id);
    expect(await balance()).toBe("930.00");
    expect((await getCart(sub)).items).toHaveLength(1);
    expect((await getCart(main)).items).toHaveLength(0);
    await updateProduct(p.id, { unitPrice: "99", colors: [{ name: "화이트" }] });
    const detail = await orderDetail(results[0].id, main.accountId);
    expect(detail.items[0].snapshot.unitPrice).toBe("35.00");
    expect(detail.items[0].note).toBe("택 제거");
    await expect(orderDetail(results[0].id, other.accountId)).rejects.toMatchObject({ status: 404 });
    await expect(placeOrder(sub, { ...input, shippingMethod: "AIR" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects MOQ, stale price, insufficient funds and foreign cart without partial writes", async () => {
    const p = await product(3);
    const row = await putCartItem(main, { variantId: p.variants[0].id, quantity: 2, note: "" });
    const input = { requestKey: randomUUID(), cartItemIds: [row.id], expectedTotal: "70", shippingMethod: "SEA" as const };
    await expect(placeOrder(main, input)).rejects.toMatchObject({ code: "MOQ_NOT_MET" });
    await putCartItem(main, { variantId: p.variants[0].id, quantity: 3, note: "" });
    await expect(placeOrder(main, input)).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    await expect(placeOrder(main, { ...input, expectedTotal: "105" })).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await expect(placeOrder(other, input)).rejects.toMatchObject({ code: "CART_ITEM_NOT_FOUND" });
    expect((await getCart(main)).items).toHaveLength(1);
    expect(await balance()).toBe("0.00");
    expect(await getDb().select().from(purchaseOrders).where(eq(purchaseOrders.accountId, main.accountId))).toHaveLength(0);
  });
  it("serializes different customer orders against one company balance", async () => {
    const p = await product(); await fund("100");
    const a = await putCartItem(main, { variantId: p.variants[0].id, quantity: 2, note: "" });
    const b = await putCartItem(sub, { variantId: p.variants[0].id, quantity: 2, note: "" });
    const results = await Promise.allSettled([placeOrder(main, { requestKey: randomUUID(), cartItemIds: [a.id], expectedTotal: "70", shippingMethod: "AIR" }),
      placeOrder(sub, { requestKey: randomUUID(), cartItemIds: [b.id], expectedTotal: "70", shippingMethod: "SEA" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toBe("30.00");
  });
  it("retains option IDs, blocks removed options and stopped products", async () => {
    const p = await product(); await fund("1000");
    const row = await putCartItem(main, { variantId: p.variants[0].id, quantity: 1, note: "" });
    await updateProduct(p.id, { memo: "수정" });
    expect((await productDetail(p.id)).variants[0].id).toBe(p.variants[0].id);
    await updateProduct(p.id, { colors: [{ name: "새 컬러" }] });
    await expect(placeOrder(main, { requestKey: randomUUID(), cartItemIds: [row.id], expectedTotal: "35", shippingMethod: "SEA" })).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
    const fresh = await productDetail(p.id);
    await updateProduct(p.id, { active: false });
    await expect(putCartItem(main, { variantId: fresh.variants[0].id, quantity: 1, note: "" })).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
    await expect(productDetail(p.id)).rejects.toMatchObject({ status: 404 });
  });
  it("enforces ten images under concurrency and validates reorder ownership", async () => {
    const p = await product();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    const results = await Promise.allSettled(Array.from({ length: 11 }, () => uploadImage(p.id, new File([png], "test.png"))));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(10);
    const photos = (await productDetail(p.id)).images;
    const order = photos.map(i => i.id).reverse();
    await updateProduct(p.id, { imageIds: order });
    expect((await productDetail(p.id)).images[0].id).toBe(order[0]);
    await expect(updateProduct(p.id, { imageIds: [randomUUID()] })).rejects.toMatchObject({ code: "INVALID_IMAGE_ORDER" });
    await deleteImage(p.id, order[0]);
    expect((await productDetail(p.id)).images).toHaveLength(9);
    await expect(uploadImage(p.id, new File(["hello"], "fake.png"))).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("rolls back an entire duplicate bulk import", async () => {
    const p = await product();
    const fields = productInput.parse({ market: "M", shopNumber: "S", productNumber: p.productNumber, unitPrice: "1", sizes: ["F"], colors: [{ name: "색상" }] });
    const freshNumber = randomUUID();
    await expect(createProducts(admin.userId, [{ ...fields, productNumber: freshNumber }, fields])).rejects.toBeDefined();
    expect(await getDb().select().from(purchaseProducts).where(eq(purchaseProducts.productNumber, freshNumber))).toHaveLength(0);
  });
  it.skipIf(process.env.BEN_PURCHASE_HTTP_TEST !== "1")("real HTTP: roles, catalog, cart, order, tenant boundaries", async () => {
    const base = "http://localhost:3000";
    async function token(auth: AuthContext) {
      const pair = await issueTokenPair(auth); await createSession(auth, pair.refreshToken, pair.refreshExpiresAt); sessions.push(auth.sessionId); return pair.accessToken;
    }
    const [at, st, ot] = await Promise.all([token(admin), token(sub), token(other)]);
    async function request(path: string, access: string, method = "GET", body?: unknown) {
      return fetch(base + path, { method, headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    }
    const payload = { market: "M", shopNumber: "S", productNumber: randomUUID(), unitPrice: "35", sizes: ["F"], colors: [{ name: "블랙" }] };
    expect((await request("/api/admin/purchase/products", st, "POST", payload)).status).toBe(403);
    const response = await request("/api/admin/purchase/products", at, "POST", payload);
    expect(response.status).toBe(201);
    const p = await response.json(); productIds.push(p.id);
    expect((await request("/api/purchase/products/" + p.id, st)).status).toBe(200);
    expect((await request("/api/purchase/cart", at)).status).toBe(403);
    const cartResponse = await request("/api/purchase/cart/items", st, "PUT", { variantId: p.variants[0].id, quantity: 2 });
    expect(cartResponse.status).toBe(200);
    const row = await cartResponse.json(); await fund("100");
    const orderResponse = await request("/api/purchase/orders", st, "POST", { requestKey: randomUUID(), cartItemIds: [row.id], expectedTotal: "70", shippingMethod: "SEA" });
    expect(orderResponse.status).toBe(201);
    const order = await orderResponse.json();
    expect((await request("/api/purchase/orders/" + order.id, ot)).status).toBe(404);
    expect((await request("/api/admin/purchase/orders/" + order.id, at)).status).toBe(200);
    expect(await balance()).toBe("30.00");
  }, 60000);
});
