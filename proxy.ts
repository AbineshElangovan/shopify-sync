import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/api/auth",
  "/api/webhooks",
  "/_next/",
  "/favicon.ico",
];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Verify authorization headers for API requests only
  if (pathname.startsWith("/api/")) {
    const authHeader = req.headers.get("authorization");
    const sessionToken = authHeader?.replace(/^Bearer\s+/i, "");

    if (!sessionToken) {
      console.log(`[Proxy] Unauthorized API request to ${pathname}. Missing token.`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
