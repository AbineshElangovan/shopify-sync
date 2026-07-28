import { NextResponse } from 'next/server';
import { processWebhookQueue } from '@/services/webhook-worker';

// To prevent Vercel from caching this route, forcing it to run on every request
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // Basic security measure (optional): You could require a secret token in the Authorization header
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }

    const { processedCount } = await processWebhookQueue();

    return NextResponse.json({
      success: true,
      message: `Processed ${processedCount} pending webhook jobs.`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Cron] process-webhooks failed:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to process webhooks',
      error: error.message
    }, { status: 500 });
  }
}
