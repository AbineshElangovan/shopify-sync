import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  try {
    const { session } = await shopify.auth.callback({ rawRequest: req });

    const host = req.nextUrl.searchParams.get("host");
    const redirectUrl = host
      ? `/?shop=${session.shop}&host=${host}`
      : `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;

    return NextResponse.redirect(new URL(redirectUrl, req.url));
  } catch (err) {
    console.error("OAuth callback failed:", err);
    return NextResponse.json({ error: "OAuth callback failed" }, { status: 500 });
  }
}