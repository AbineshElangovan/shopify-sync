import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, handleApiError } from '@/lib/shopify/authenticate';

export async function PUT(req: NextRequest) {
  try {
    const { store: requestStore } = await authenticate(req);
    const body = await req.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'storeId is required' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId }
    });

    if (!store) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    if (store.isMaster) {
      const anotherMaster = await prisma.store.findFirst({
        where: {
          id: { not: storeId },
          isActive: true,
          isMaster: true,
        }
      });

      if (!anotherMaster) {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot make Master store Standalone. assign a new Master first."
          },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // Delete all connections where this store is either source or target
      await tx.storeConnection.deleteMany({
        where: {
          OR: [
            { sourceStoreId: storeId },
            { targetStoreId: storeId }
          ]
        }
      });

      // Update the store to no longer be master
      await tx.store.update({
        where: { id: storeId },
        data: { isMaster: false }
      });
    });

    return NextResponse.json({ success: true, message: 'Store is now standalone.' });
  } catch (error: any) {
    console.error('[Standalone API] PUT error:', error);
    return handleApiError(error);
  }
}
