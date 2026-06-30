import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "@/lib/shopify/authenticate";

export async function POST(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}