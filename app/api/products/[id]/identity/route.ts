import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, handleApiError } from '@/lib/shopify/authenticate';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { store } = await authenticate(req);
    const { id } = await params;
    const productId = id; // Usually e.g. "9876543210"

    const identities = await prisma.productUniqueIdentity.findMany({
      where: {
        storeId: store.id,
        shopifyProductId: productId
      }
    });

    if (identities.length === 0) {
      return NextResponse.json({ success: false, error: "No Identity found for this Product." }, { status: 404 });
    }

    return NextResponse.json({ success: true, identities });
  } catch (error: any) {
    return handleApiError(error);
  }
}
