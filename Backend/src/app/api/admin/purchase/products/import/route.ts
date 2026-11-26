import { NextRequest } from "next/server";
import { z } from "zod";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { createProducts } from "@/lib/purchase/products";
import { productInput } from "@/lib/purchase/schemas";
import { parseWorkbook } from "@/lib/purchase/import";
import { AppError } from "@/lib/http";
import { readRequestBody } from "@/lib/request-body";
export async function POST(req: NextRequest) {
  return purchaseResponse(async () => {
    const auth = await purchaseAuth(req, "admin");
    let inputs;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) throw new AppError(400, "FILE_REQUIRED", "file이 필요합니다.");
      inputs = await parseWorkbook(file);
    } else inputs = z.object({ items: z.array(productInput).min(1).max(100) }).strict().parse(await readRequestBody(req)).items;
    return { items: await createProducts(auth.userId, inputs) };
  }, 201);
}
