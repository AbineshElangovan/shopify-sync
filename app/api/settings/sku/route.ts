import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);

    const setting = await prisma.storeSetting.upsert({
      where: { storeId: store.id },
      update: {},
      create: {
        storeId: store.id,
        skuPrefix: "SKU",
        skuSequence: 1,
      }
    });

    return NextResponse.json({ success: true, setting });
  } catch (err: any) {
    console.error("[SKU Settings API] GET Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    const { skuPrefix } = body;

    if (!skuPrefix || typeof skuPrefix !== "string") {
      return NextResponse.json({ success: false, error: "Valid SKU Prefix is required" }, { status: 400 });
    }

    const cleanPrefix = skuPrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

    const setting = await prisma.storeSetting.upsert({
      where: { storeId: store.id },
      update: { skuPrefix: cleanPrefix },
      create: {
        storeId: store.id,
        skuPrefix: cleanPrefix,
        skuSequence: 1,
      }
    });

    return NextResponse.json({ success: true, setting });
  } catch (err: any) {
    console.error("[SKU Settings API] POST Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
