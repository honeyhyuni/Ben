import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { productDetail } from "@/lib/purchase/products";
import { updateProduct } from "@/lib/purchase/products";
import { productPatch } from "@/lib/purchase/schemas";
import { readRequestBody } from "@/lib/request-body";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Context) { return purchaseResponse(async () => { await purchaseAuth(req, "admin"); return productDetail(z.uuid().parse((await ctx.params).id), true); }); }
export async function PATCH(req: NextRequest, ctx: Context) { return purchaseResponse(async () => { await purchaseAuth(req, "admin"); return updateProduct(z.uuid().parse((await ctx.params).id), productPatch.parse(await readRequestBody(req))); }); }
