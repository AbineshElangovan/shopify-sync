import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    
    // Fetch all connections universally
    const connections = await prisma.storeConnection.findMany({
      include: {
        targetStore: {
          select: {
            id: true,
            shopDomain: true,
            label: true,
            uniqueStoreId: true,
          }
        }
      }
    });

    return NextResponse.json({ success: true, store, connections });
  } catch (err: any) {
    console.error("[Connections API] GET Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    const { uniqueStoreId } = body;

    if (!uniqueStoreId) {
      return NextResponse.json({ success: false, error: "Unique Store ID is required" }, { status: 400 });
    }

    if (uniqueStoreId === store.uniqueStoreId) {
      return NextResponse.json({ success: false, error: "You cannot connect a store to itself" }, { status: 400 });
    }

    // Find the target store by uniqueStoreId
    const targetStore = await prisma.store.findUnique({
      where: { uniqueStoreId }
    });

    if (!targetStore) {
      return NextResponse.json({ success: false, error: "Invalid Unique Store ID. Store not found." }, { status: 404 });
    }

    // Prevent duplicate connections
    const existing = await prisma.storeConnection.findUnique({
      where: {
        sourceStoreId_targetStoreId: {
          sourceStoreId: store.id,
          targetStoreId: targetStore.id
        }
      }
    });

    if (existing) {
      return NextResponse.json({ success: false, error: "Store is already connected" }, { status: 400 });
    }

    const connection = await prisma.storeConnection.create({
      data: {
        sourceStoreId: store.id,
        targetStoreId: targetStore.id
      },
      include: {
        targetStore: {
          select: {
            id: true,
            shopDomain: true,
            label: true,
            uniqueStoreId: true
          }
        }
      }
    });

    return NextResponse.json({ success: true, connection });
  } catch (err: any) {
    console.error("[Connections API] POST Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const url = new URL(req.url);
    const targetStoreId = url.searchParams.get('targetStoreId');

    if (!targetStoreId) {
      return NextResponse.json({ success: false, error: "Target Store ID is required" }, { status: 400 });
    }

    await prisma.storeConnection.deleteMany({
      where: {
        targetStoreId
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Connections API] DELETE Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
