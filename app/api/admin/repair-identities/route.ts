import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, handleApiError } from '@/lib/shopify/authenticate';
import { createMasterProductMapping } from '@/services/product-mapping';

export async function POST(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    if (!store.isMaster) {
      return NextResponse.json({ success: false, error: "Only Master Store can run repair tool." }, { status: 403 });
    }

    const body = await req.json();
    const productId = body.productId; 
    const variantId = body.variantId;

    if (!productId || !variantId) {
      return NextResponse.json({ success: false, error: "productId and variantId required." }, { status: 400 });
    }

    // 1. Check if mapping exists
    const existing = await prisma.productMapping.findUnique({
      where: {
        storeId_shopifyVariantId: {
          storeId: store.id,
          shopifyVariantId: variantId
        }
      }
    });

    if (existing) {
      return NextResponse.json({ success: true, message: "Mapping already exists. No repair needed.", mapping: existing });
    }

    // 2. Repair (Generate missing mapping)
    const newMapping = await createMasterProductMapping(store.id, productId, variantId);

    console.warn(`[Admin Repair] Generated missing identity for variant ${variantId}`);

    return NextResponse.json({ success: true, message: "Repair successful.", mapping: newMapping });
  } catch (error: any) {
    return handleApiError(error);
  }
}
