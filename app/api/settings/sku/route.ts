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
    const { skuPrefix, skuSequence } = body;

    if (!skuPrefix || typeof skuPrefix !== "string" || skuPrefix.length < 2 || skuPrefix.length > 10) {
      return NextResponse.json({ success: false, error: "Product Prefix must be between 2 and 10 characters." }, { status: 400 });
    }

    const cleanPrefix = skuPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    const requestedSequence = parseInt(skuSequence, 10);
    
    if (isNaN(requestedSequence) || requestedSequence < 1 || requestedSequence > 999999) {
      return NextResponse.json({ success: false, error: "Sequence must be a valid number between 1 and 999999." }, { status: 400 });
    }

    // Validation: Check prefix history
    const prefixStr = `STB-${cleanPrefix}-`;
    const existingProducts = await prisma.productCache.findMany({
      where: { 
        storeId: store.id,
        sku: { startsWith: prefixStr }
      },
      select: { sku: true }
    });

    let maxSeq = 0;
    for (const product of existingProducts) {
      if (!product.sku) continue;
      const seqPart = product.sku.replace(prefixStr, '');
      const seqNum = parseInt(seqPart, 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) {
        maxSeq = seqNum;
      }
    }

    if (maxSeq > 0 && requestedSequence <= maxSeq) {
      return NextResponse.json({ 
        success: false, 
        error: `Prefix "${cleanPrefix}" already exists. Next available sequence: ${maxSeq + 1}.`,
        nextSequence: maxSeq + 1
      }, { status: 400 });
    }

    const setting = await prisma.storeSetting.upsert({
      where: { storeId: store.id },
      update: { skuPrefix: cleanPrefix, skuSequence: requestedSequence, isSkuGenerationEnabled: true },
      create: {
        storeId: store.id,
        skuPrefix: cleanPrefix,
        skuSequence: requestedSequence,
        isSkuGenerationEnabled: true,
      }
    });

    return NextResponse.json({ success: true, setting });
  } catch (err: any) {
    console.error("[SKU Settings API] POST Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
