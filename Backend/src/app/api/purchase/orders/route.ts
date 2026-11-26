import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { listOrders, orderDetail, placeOrder } from "@/lib/purchase/orders";
import { listQuery, orderInput } from "@/lib/purchase/schemas";
import { readRequestBody } from "@/lib/request-body";
export async function GET(req: NextRequest) {
  return purchaseResponse(async () => {
    const auth = await purchaseAuth(req, "customer");
    return listOrders(listQuery.parse(Object.fromEntries(req.nextUrl.searchParams)), auth.accountId);
  });
}
export async function POST(req: NextRequest) {
  return purchaseResponse(async () => {
    const auth = await purchaseAuth(req, "customer");
    const order = await placeOrder(auth, orderInput.parse(await readRequestBody(req)));
    return orderDetail(order.id, auth.accountId);
  }, 201);
}
