import { NextRequest, NextResponse } from "next/server";



const PUBLIC_PREFIXES = [
  "/api/auth",
  "/api/webhooks",
  "/_next/",
  "/favicon.ico",
];

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;


  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  
  const authHeader = req.headers.get("authorization");
  const sessionToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (sessionToken) {
 
    return NextResponse.next();
  }

  const shop = searchParams.get("shop");

  if (shop) {

    const host = searchParams.get("host") ?? "";
    const authUrl = new URL("/api/auth", req.nextUrl.origin);
    authUrl.searchParams.set("shop", shop);
    if (host) authUrl.searchParams.set("host", host);

    console.log(`[Middleware] No session token, redirecting to OAuth for shop: ${shop}`);
    return NextResponse.redirect(authUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
