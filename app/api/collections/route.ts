import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/shopify/authenticate";

// This is the public collections endpoint. 
// Collections are synced automatically via internal Shopify webhooks/sync services.
// Therefore, mutations are strictly forbidden via the public API to ensure Shopify remains the single source of truth.

export async function GET(req: NextRequest) {
  try {
    const collections = await prisma.collection.findMany({
      orderBy: { title: 'asc' }
    });
    return NextResponse.json(collections);
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  return new NextResponse("Method Not Allowed. Collections can only be created via Shopify.", { status: 405 });
}

export async function PUT(req: NextRequest) {
  return new NextResponse("Method Not Allowed. Collections can only be updated via Shopify.", { status: 405 });
}

export async function DELETE(req: NextRequest) {
  return new NextResponse("Method Not Allowed. Collections can only be deleted via Shopify.", { status: 405 });
}
