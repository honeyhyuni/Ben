import { NextRequest } from "next/server";
import { z } from "zod";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { deleteImage } from "@/lib/purchase/images";
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; imageId: string }> }) {
  return purchaseResponse(async () => {
    await purchaseAuth(req, "admin");
    const params = await ctx.params;
    await deleteImage(z.uuid().parse(params.id), z.uuid().parse(params.imageId));
    return { deleted: true };
  });
}
