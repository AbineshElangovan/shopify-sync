import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, handleApiError } from '@/lib/shopify/authenticate';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    const { storeId, masterLabel } = body;

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'storeId is required' }, { status: 400 });
    }

    // Verify ownership/access before updating master store
    const connections = await (prisma as any).storeConnection.findMany({
      where: { sourceStoreId: store.id }
    });
    const authorizedStoreIds = new Set([store.id, ...connections.map((c: any) => c.targetStoreId)]);
    
    if (!authorizedStoreIds.has(storeId)) {
      return NextResponse.json({ success: false, error: `Unauthorized to modify store ${storeId}` }, { status: 403 });
    }

    if (!masterLabel || masterLabel.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'masterLabel cannot be empty' }, { status: 400 });
    }

    const trimmedLabel = masterLabel.trim();

    // Check if the label is already used by another store
    const existingLabelStore = await prisma.store.findUnique({
      where: { masterLabel: trimmedLabel }
    });

    if (existingLabelStore && existingLabelStore.id !== storeId) {
      return NextResponse.json({ success: false, error: `Master Label "${trimmedLabel}" is already used by another store.` }, { status: 400 });
    }

    // Check if the store is inactive
    const targetStore = await prisma.store.findUnique({
      where: { id: storeId }
    });

    if (!targetStore) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    if (!targetStore.isActive) {
      return NextResponse.json({ success: false, error: 'Cannot set an inactive store as the Master Store.' }, { status: 400 });
    }

    // Transaction to safely switch master store
    await prisma.$transaction([
      prisma.store.updateMany({
        data: { isMaster: false }
      }),
      prisma.store.update({
        where: { id: storeId },
        data: { isMaster: true, masterLabel: trimmedLabel }
      })
    ]);

    const updatedStore = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        shopDomain: true,
        masterLabel: true,
        isMaster: true
      }
    });

    return NextResponse.json({ success: true, masterStore: updatedStore });
  } catch (error: any) {
    console.error('[Master Store API] Error:', error);
    return handleApiError(error);
  }
}
