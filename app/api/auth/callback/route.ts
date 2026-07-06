import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback } from "@/services/shopify";

export async function GET(req: NextRequest) {
  console.log("[OAuth] callback route hit", {
    url: req.url,
    host: req.headers.get("host"),
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    cookieHeader: req.headers.get("cookie"),
  });
  try {
    console.log("[OAuth] Invoking handleAuthCallback");
    const response = await handleAuthCallback(req);
    console.log("[OAuth] handleAuthCallback completed successfully. Response status:", response.status);
    return response;
  } catch (error: any) {
    console.error("[OAuth] callback error", {
      message: error?.message,
      stack: error?.stack,
    });
    return new NextResponse(`Failed to complete OAuth process: ${error.message}`, { status: 500 });
  }
}