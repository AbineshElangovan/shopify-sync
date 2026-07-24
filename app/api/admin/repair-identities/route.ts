import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, handleApiError } from '@/lib/shopify/authenticate';
import { generateProductIdentity } from '@/services/product-identity';

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

    // 1. Check if identity exists
    const existing = await prisma.productUniqueIdentity.findUnique({
      where: {
        storeId_shopifyVariantId: {
          storeId: store.id,
          shopifyVariantId: variantId
        }
      }
    });

    if (existing) {
      return NextResponse.json({ success: true, message: "Identity already exists. No repair needed.", identity: existing });
    }

    // 2. Repair (Generate missing identity)
    const newIdentity = await generateProductIdentity(store.id, productId, variantId);

    console.warn(`[Admin Repair] Generated missing identity for variant ${variantId}`);

    return NextResponse.json({ success: true, message: "Repair successful.", identity: newIdentity });
  } catch (error: any) {
    return handleApiError(error);
  }
}
