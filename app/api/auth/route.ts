import { NextRequest, NextResponse } from "next/server";
import { beginAuth } from "@/services/shopify";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  console.log("[Install] auth route hit", { shop, url: req.url });

  if (!shop) {
    console.log("[Install] missing shop parameter");
    return new Response("Missing shop parameter", { status: 400 });
  }

  try {
    const response = await beginAuth(shop, req);
    const redirectUrl = response.headers.get("location");
    const host = req.nextUrl.searchParams.get("host");
    const embedded = req.nextUrl.searchParams.get("embedded");

    if (redirectUrl && (embedded === "1" || host)) {
      console.log("[Install] Iframe detected. Returning HTML breakout redirect.");
      
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", "text/html");
      
      // Pass along the cookies/headers returned by beginAuth (Set-Cookie)
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        }
      });

      return new Response(
        `<!DOCTYPE html>
        <html>
          <head>
            <script type="text/javascript">
              window.top.location.href = "${redirectUrl}";
            </script>
          </head>
          <body>
            <p>Redirecting to Shopify authorization...</p>
          </body>
        </html>`,
        {
          headers: responseHeaders,
        }
      );
    }

    console.log("[Install] auth.begin successful redirect");
    return response;
  } catch (error: any) {
    console.error("[Install] auth.begin failed", {
      message: error?.message,
      stack: error?.stack,
    });
    return new Response(`Failed to start OAuth flow: ${error.message}`, { status: 500 });
  }
}