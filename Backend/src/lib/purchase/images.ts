import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { purchaseImages as images, purchaseProducts as products } from "@/db/schema";
import { AppError } from "@/lib/http";
import { lockProduct } from "./products";

export function imageType(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new AppError(400, "INVALID_IMAGE", "JPEG, PNG, WebP 사진만 가능합니다.");
}
export async function uploadImage(productId: string, file: File) {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new AppError(400, "IMAGE_TOO_LARGE", "사진은 최대 5MiB입니다.");
  const data = Buffer.from(await file.arrayBuffer());
  const contentType = imageType(data);
  return getDb().transaction(async tx => {
    await lockProduct(tx, productId);
    const existing = await tx.select({ position: images.position }).from(images).where(eq(images.productId, productId));
    if (existing.length >= 10) throw new AppError(409, "IMAGE_LIMIT", "상품 사진은 최대 10장입니다.");
    const [row] = await tx.insert(images).values({ productId, position: Math.max(-1, ...existing.map(i => i.position)) + 1,
      contentBase64: data.toString("base64"), sizeBytes: data.length, contentType }).returning({ id: images.id, position: images.position });
    return { ...row, url: `/api/purchase/images/${row.id}` };
  });
}
export async function deleteImage(productId: string, id: string) {
  await getDb().transaction(async tx => {
    await lockProduct(tx, productId);
    const removed = await tx.delete(images).where(and(eq(images.id, id), eq(images.productId, productId))).returning({ id: images.id });
    if (!removed.length) throw new AppError(404, "IMAGE_NOT_FOUND", "사진이 없습니다.");
    const remaining = await tx.select({ id: images.id }).from(images).where(eq(images.productId, productId)).orderBy(asc(images.position));
    for (const [position, row] of remaining.entries()) await tx.update(images).set({ position }).where(eq(images.id, row.id));
  });
}
export async function readImage(id: string, admin: boolean) {
  const [row] = await getDb().select({ contentBase64: images.contentBase64, contentType: images.contentType }).from(images)
    .innerJoin(products, eq(products.id, images.productId)).where(and(eq(images.id, id), admin ? undefined : eq(products.active, true)));
  if (!row) throw new AppError(404, "IMAGE_NOT_FOUND", "사진이 없습니다.");
  return row;
}
