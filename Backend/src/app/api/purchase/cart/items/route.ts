import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { cartInput } from "@/lib/purchase/schemas";
import { putCartItem } from "@/lib/purchase/cart";
import { readRequestBody } from "@/lib/request-body";

export async function PUT(req: NextRequest) { return purchaseResponse(async () => { const auth = await purchaseAuth(req, "customer"); return putCartItem(auth, cartInput.parse(await readRequestBody(req))); }); }
