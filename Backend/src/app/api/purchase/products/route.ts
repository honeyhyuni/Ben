import { NextRequest } from "next/server";
import { purchaseAuth } from "@/lib/purchase/auth";
import { purchaseResponse } from "@/lib/purchase/http";
import { listProducts } from "@/lib/purchase/products";
import { listQuery } from "@/lib/purchase/schemas";

export async function GET(req: NextRequest) { return purchaseResponse(async () => { await purchaseAuth(req); return listProducts(listQuery.parse(Object.fromEntries(req.nextUrl.searchParams))); }); }
