import { NextRequest } from "next/server";
import { z } from "zod";
import { purchaseAuth } from "@/lib/purchase/auth";
import { readImage } from "@/lib/purchase/images";
import { jsonError } from "@/lib/http";
export async function GET(req: NextRequest, ctx: { params: Promise<{ imageId: string }> }) {
  try {
    const auth = await purchaseAuth(req);
    const row = await readImage(z.uuid().parse((await ctx.params).imageId), ["ADMIN", "SUPER_ADMIN"].includes(auth.accountRole));
    return new Response(new Uint8Array(Buffer.from(row.contentBase64, "base64")), {
      headers: { "Content-Type": row.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) { return jsonError(error); }
}
