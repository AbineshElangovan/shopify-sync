import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback } from "@/services/shopify";

export async function GET(req: NextRequest) {
  try {
    return await handleAuthCallback(req);
  } catch (error: any) {
    console.error("[OAuth] callback error", {
      message: error?.message,
      stack: error?.stack,
    });
    return new NextResponse(`Failed to complete OAuth process: ${error.message}`, { status: 500 });
  }
}