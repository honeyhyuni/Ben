import { NextRequest } from "next/server";
import { z } from "zod";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { uploadImage } from "@/lib/purchase/images";
import { AppError } from "@/lib/http";
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return purchaseResponse(async () => {
    await purchaseAuth(req, "admin");
    const id = z.uuid().parse((await ctx.params).id);
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new AppError(400, "FILE_REQUIRED", "file이 필요합니다.");
    return uploadImage(id, file);
  }, 201);
}
