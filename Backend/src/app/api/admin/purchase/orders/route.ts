import { NextRequest } from "next/server";
import { z } from "zod";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { listOrders } from "@/lib/purchase/orders";
import { listQuery } from "@/lib/purchase/schemas";
export async function GET(req: NextRequest) {
  return purchaseResponse(async () => {
    await purchaseAuth(req, "admin");
    const accountId = req.nextUrl.searchParams.get("accountId");
    return listOrders(listQuery.parse(Object.fromEntries(req.nextUrl.searchParams)), accountId ? z.uuid().parse(accountId) : undefined);
  });
}
