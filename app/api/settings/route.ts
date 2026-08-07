import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const storeSetting = await prisma.storeSetting.findUnique({ where: { storeId: store.id } });
    return NextResponse.json({
      success: true,
      settings: {
        lowStockThreshold: store.lowStockThreshold,
        autoSyncEnabled: store.autoSyncEnabled,
        dataRetentionEnabled: (storeSetting as any)?.dataRetentionEnabled ?? true,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 401 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    
    const { lowStockThreshold, autoSyncEnabled, dataRetentionEnabled } = body;
    
    const updated = await prisma.store.update({
      where: { id: store.id },
      data: {
        ...(typeof lowStockThreshold === 'number' && { lowStockThreshold }),
        ...(typeof autoSyncEnabled === 'boolean' && { autoSyncEnabled }),
      }
    });

    if (typeof dataRetentionEnabled === 'boolean') {
      await (prisma.storeSetting as any).upsert({
        where: { storeId: store.id },
        update: { dataRetentionEnabled },
        create: { storeId: store.id, dataRetentionEnabled }
      });
    }
    
    return NextResponse.json({
      success: true,
      settings: {
        lowStockThreshold: updated.lowStockThreshold,
        autoSyncEnabled: updated.autoSyncEnabled,
        dataRetentionEnabled: typeof dataRetentionEnabled === 'boolean' ? dataRetentionEnabled : true,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
