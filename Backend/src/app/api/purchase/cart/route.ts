import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { getCart } from "@/lib/purchase/cart";

export async function GET(req: NextRequest) { return purchaseResponse(async () => { const auth = await purchaseAuth(req, "customer"); return getCart(auth); }); }
