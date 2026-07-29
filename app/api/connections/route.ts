import { NextRequest, NextResponse } from "next/server";
import { authenticate, handleApiError } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    
    // Fetch outgoing connections
    const outgoing = await prisma.storeConnection.findMany({
      where: { sourceStoreId: store.id },
      include: { targetStore: true }
    });

    // Fetch incoming connections (the master store)
    const incoming = await prisma.storeConnection.findMany({
      where: { targetStoreId: store.id },
      include: { sourceStore: true }
    });
    
    // Fetch sibling connections (other sub-stores connected to our master)
    const masterStoreIds = incoming.map(c => c.sourceStoreId);
    let siblings: any[] = [];
    if (masterStoreIds.length > 0) {
      siblings = await prisma.storeConnection.findMany({
        where: { 
          sourceStoreId: { in: masterStoreIds },
          targetStoreId: { not: store.id } // Exclude ourselves
        },
        include: { targetStore: true }
      });
    }

    // Map them into a unified list for the frontend
    const connections = [
      ...outgoing.map(c => ({
        targetStoreId: c.targetStoreId,
        direction: 'outgoing',
        targetStore: {
          id: c.targetStore.id,
          shopDomain: c.targetStore.shopDomain,
          label: c.targetStore.label,
          uniqueStoreId: c.targetStore.uniqueStoreId,
          isActive: c.targetStore.isActive,
        }
      })),
      ...incoming.map(c => ({
        targetStoreId: c.sourceStoreId, // mapped for frontend compatibility
        direction: 'incoming',
        targetStore: {
          id: c.sourceStore.id,
          shopDomain: c.sourceStore.shopDomain,
          label: c.sourceStore.label,
          uniqueStoreId: c.sourceStore.uniqueStoreId,
          isActive: c.sourceStore.isActive,
        }
      })),
      ...siblings.map(c => ({
        targetStoreId: c.targetStoreId,
        direction: 'sibling',
        targetStore: {
          id: c.targetStore.id,
          shopDomain: c.targetStore.shopDomain,
          label: c.targetStore.label,
          uniqueStoreId: c.targetStore.uniqueStoreId,
          isActive: c.targetStore.isActive,
        }
      }))
    ];

    return NextResponse.json({ success: true, store, connections });
  } catch (err: any) {
    console.error("[Connections API] GET Error:", err.message);
    return handleApiError(err);
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

    // Prevent duplicate connections (in either direction to be safe)
    const existing = await prisma.storeConnection.findFirst({
      where: {
        OR: [
          { sourceStoreId: store.id, targetStoreId: targetStore.id },
          { sourceStoreId: targetStore.id, targetStoreId: store.id }
        ]
      }
    });

    if (existing) {
      return NextResponse.json({ success: false, error: "Store is already connected" }, { status: 400 });
    }

    const connection = await prisma.storeConnection.create({
      data: {
        sourceStoreId: store.id,
        targetStoreId: targetStore.id
      }
    });

    return NextResponse.json({ success: true, connection });
  } catch (err: any) {
    console.error("[Connections API] POST Error:", err.message);
    return handleApiError(err);
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
        OR: [
          { sourceStoreId: store.id, targetStoreId: targetStoreId },
          { sourceStoreId: targetStoreId, targetStoreId: store.id }
        ]
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Connections API] DELETE Error:", err.message);
    return handleApiError(err);
  }
}
