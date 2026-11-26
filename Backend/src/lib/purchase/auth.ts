import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/request-auth";
import { AppError } from "@/lib/http";
export async function purchaseAuth(req: NextRequest, access: "read" | "admin" | "customer" = "read") {
  const auth = await requireAuth(req);
  const admin = ["SUPER_ADMIN", "ADMIN"].includes(auth.accountRole);
  if ((access === "admin" && !admin) || (access === "customer" && admin))
    throw new AppError(403, "PURCHASE_FORBIDDEN", "사입 처리 권한이 없습니다.");
  return auth;
}
