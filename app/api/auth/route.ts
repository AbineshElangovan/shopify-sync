import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: NextRequest) {
 
  const shop = request.nextUrl.searchParams.get("shop");

  
  if (!shop) {
    return NextResponse.json(
      { error: "Shop parameter is missing" },
      { status: 400 }
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${process.env.SHOPIFY_SCOPES}` +
    `&redirect_uri=${process.env.SHOPIFY_APP_URL}/api/auth/callback` +
    `&state=${state}`;


  return NextResponse.redirect(authUrl);
}