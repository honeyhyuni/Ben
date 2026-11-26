import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { removeCartItem } from "@/lib/purchase/cart";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Context) { return purchaseResponse(async () => { const auth = await purchaseAuth(req, "customer"); await removeCartItem(auth, z.uuid().parse((await ctx.params).id)); return { deleted: true }; }); }
