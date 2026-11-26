import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { productDetail } from "@/lib/purchase/products";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Context) { return purchaseResponse(async () => { await purchaseAuth(req); return productDetail(z.uuid().parse((await ctx.params).id)); }); }
