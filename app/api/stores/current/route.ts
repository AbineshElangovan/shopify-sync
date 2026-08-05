import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/shopify/authenticate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    return NextResponse.json({ isMaster: store.isMaster });
  } catch (error) {
    return NextResponse.json({ isMaster: false });
  }
}
