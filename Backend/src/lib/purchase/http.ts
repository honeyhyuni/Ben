import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/http";
export async function purchaseResponse(action: () => Promise<unknown>, status = 200) {
  try { return NextResponse.json(await action(), { status, headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const db = error as { code?: string; cause?: { code?: string } };
    if (db.code === "23505" || db.cause?.code === "23505")
      return jsonError(new AppError(409, "DUPLICATE_PRODUCT", "이미 등록된 시장·가게번호·품번입니다."));
    return jsonError(error);
  }
}
