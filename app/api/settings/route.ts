import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    return NextResponse.json({
      success: true,
      settings: {
        lowStockThreshold: store.lowStockThreshold,
        autoSyncEnabled: store.autoSyncEnabled,
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
    
    const { lowStockThreshold, autoSyncEnabled } = body;
    
    const updated = await prisma.store.update({
      where: { id: store.id },
      data: {
        ...(typeof lowStockThreshold === 'number' && { lowStockThreshold }),
        ...(typeof autoSyncEnabled === 'boolean' && { autoSyncEnabled }),
      }
    });
    
    return NextResponse.json({
      success: true,
      settings: {
        lowStockThreshold: updated.lowStockThreshold,
        autoSyncEnabled: updated.autoSyncEnabled,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
