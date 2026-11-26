import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { listProducts } from "@/lib/purchase/products";
import { productDetail } from "@/lib/purchase/products";
import { createProducts } from "@/lib/purchase/products";
import { listQuery } from "@/lib/purchase/schemas";
import { productInput } from "@/lib/purchase/schemas";
import { readRequestBody } from "@/lib/request-body";

export async function GET(req: NextRequest) { return purchaseResponse(async () => { await purchaseAuth(req, "admin"); return listProducts(listQuery.parse(Object.fromEntries(req.nextUrl.searchParams)), true); }); }
export async function POST(req: NextRequest) { return purchaseResponse(async () => { const auth = await purchaseAuth(req, "admin"); const [product] = await createProducts(auth.userId, [productInput.parse(await readRequestBody(req))]); return productDetail(product.id, true); }, 201); }
