import { NextRequest, NextResponse } from "next/server";
import { beginAuth } from "@/services/shopify";
import { shopify } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  console.log("[Install] auth route hit", { 
    shop, 
    url: req.url,
    host: req.headers.get("host"),
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto")
  });

  if (!shop) {
    console.log("[Install] missing shop parameter");
    return new Response("Missing shop parameter", { status: 400 });
  }

  const host = req.nextUrl.searchParams.get("host");
  const embedded = req.nextUrl.searchParams.get("embedded");

  if (embedded === "1" || host) {
    console.log("[Install] Iframe detected in /api/auth. Returning HTML breakout redirect to top-level.");
    const hostName = shopify.config.hostName || req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
    const topRedirectUrl = `https://${hostName}/api/auth?shop=${encodeURIComponent(shop)}`;
    
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <script type="text/javascript">
            try {
              if (window.top && window.top.location) {
                window.top.location.href = "${topRedirectUrl}";
              } else {
                window.location.href = "${topRedirectUrl}";
              }
            } catch (e) {
              const link = document.createElement('a');
              link.href = "${topRedirectUrl}";
              link.target = "_top";
              document.body.appendChild(link);
              link.click();
            }
          </script>
        </head>
        <body>
          <p>Redirecting to Shopify authorization...</p>
        </body>
      </html>`,
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    );
  }

  try {
    console.log("[OAuthStart] Incoming request URL:", req.url);
    console.log("[OAuthStart] Shop domain:", shop);
    console.log("[Install] Invoking beginAuth for shop:", shop);
    const response = await beginAuth(shop, req);
    
    const location = response.headers.get("location") || "";
    const stateMatch = location.match(/state=([^&]+)/);
    const state = stateMatch ? stateMatch[1] : "not found";
    console.log("[OAuthStart] Generated OAuth state:", state);
    console.log("[OAuthStart] Redirect URL:", location);
    console.log("[OAuthStart] Set-Cookie headers:", response.headers.getSetCookie());
    console.log("[Install] auth.begin successful redirect", { status: response.status, headers: [...response.headers.entries()] });
    return response;
  } catch (error: any) {
    console.error("[Install] auth.begin failed", {
      message: error?.message,
      stack: error?.stack,
    });
    return new Response(`Failed to start OAuth flow: ${error.message}`, { status: 500 });
  }
}