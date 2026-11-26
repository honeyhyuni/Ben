import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { purchaseProducts as products, purchaseVariants as variants, purchaseImages as images } from "@/db/schema";
import { AppError } from "@/lib/http";
import type { ListQuery, ProductInput, ProductPatch } from "./schemas";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export async function lockProduct(tx: Tx, id: string) {
  const [product] = await tx.select().from(products).where(eq(products.id, id)).for("update");
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "상품이 없습니다.");
  return product;
}

async function replaceVariants(tx: Tx, id: string, sizes: string[], colors: ProductInput["colors"]) {
  if (sizes.length * colors.length > 500) throw new AppError(400, "VARIANT_LIMIT", "상품 옵션 조합은 최대 500개입니다.");
  await tx.update(variants).set({ active: false }).where(eq(variants.productId, id));
  const rows = sizes.flatMap(size => colors.map(color => ({ productId: id, size, color: color.name, colorHex: color.hex ?? null, active: true })));
  // Preserve IDs used by carts and historical orders.
  await tx.insert(variants).values(rows).onConflictDoUpdate({
    target: [variants.productId, variants.color, variants.size], set: { active: true, colorHex: sql`excluded.color_hex` },
  });
}

export async function createProducts(actor: string, inputs: ProductInput[]) {
  return getDb().transaction(async tx => {
    const result = [];
    for (const input of inputs) {
      const { sizes, colors, ...fields } = input;
      const [product] = await tx.insert(products).values({ ...fields, createdBy: actor }).returning();
      await replaceVariants(tx, product.id, sizes, colors);
      result.push(product);
    }
    return result;
  });
}

export async function updateProduct(id: string, input: ProductPatch) {
  await getDb().transaction(async tx => {
    await lockProduct(tx, id);
    const { sizes, colors, imageIds, ...fields } = input;
    await tx.update(products).set({ ...fields, updatedAt: new Date() }).where(eq(products.id, id));
    if (sizes || colors) {
      const old = await tx.select().from(variants).where(and(eq(variants.productId, id), eq(variants.active, true)));
      const nextSizes = sizes ?? [...new Set(old.map(v => v.size))];
      const nextColors = colors ?? [...new Map(old.map(v => [v.color, { name: v.color, hex: v.colorHex }])).values()];
      await replaceVariants(tx, id, nextSizes, nextColors);
    }
    if (imageIds) {
      const existing = await tx.select({ id: images.id }).from(images).where(eq(images.productId, id));
      if (existing.length !== imageIds.length || existing.some(i => !imageIds.includes(i.id)))
        throw new AppError(400, "INVALID_IMAGE_ORDER", "현재 상품의 모든 사진을 순서대로 지정해 주세요.");
      for (const [position, imageId] of imageIds.entries())
        await tx.update(images).set({ position }).where(eq(images.id, imageId));
    }
  });
  return productDetail(id, true);
}

async function decorate(rows: (typeof products.$inferSelect)[]) {
  if (!rows.length) return [];
  const ids = rows.map(p => p.id);
  const [options, photos] = await Promise.all([
    getDb().select().from(variants).where(and(inArray(variants.productId, ids), eq(variants.active, true))).orderBy(asc(variants.color), asc(variants.size)),
    getDb().select({ id: images.id, productId: images.productId, position: images.position }).from(images)
      .where(inArray(images.productId, ids)).orderBy(asc(images.position), asc(images.id)),
  ]);
  return rows.map(p => ({ ...p, currency: "CNY", variants: options.filter(v => v.productId === p.id),
    images: photos.filter(i => i.productId === p.id).map(i => ({ ...i, url: `/api/purchase/images/${i.id}` })) }));
}

export async function productDetail(id: string, admin = false) {
  const rows = await getDb().select().from(products).where(and(eq(products.id, id), admin ? undefined : eq(products.active, true)));
  if (!rows.length) throw new AppError(404, "PRODUCT_NOT_FOUND", "상품이 없습니다.");
  return (await decorate(rows))[0];
}

export async function listProducts(query: ListQuery, admin = false) {
  const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = and(admin ? undefined : eq(products.active, true), query.market ? eq(products.market, query.market) : undefined,
    or(ilike(products.productNumber, pattern), ilike(products.market, pattern), ilike(products.shopNumber, pattern)));
  const [rows, totals] = await Promise.all([
    getDb().select().from(products).where(filter).orderBy(desc(products.createdAt), desc(products.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    getDb().select({ total: count() }).from(products).where(filter),
  ]);
  return { items: await decorate(rows), total: totals[0].total, page: query.page, pageSize: query.pageSize };
}
