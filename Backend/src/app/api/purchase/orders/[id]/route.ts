import { NextRequest } from "next/server";
import { z } from "zod";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { orderDetail } from "@/lib/purchase/orders";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return purchaseResponse(async () => {
    const auth = await purchaseAuth(req, "customer");
    return orderDetail(z.uuid().parse((await ctx.params).id), auth.accountId);
  });
}
