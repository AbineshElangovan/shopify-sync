import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId');

  // Only query for activities that occurred AFTER the connection started
  let lastCreatedAt = new Date(); 

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initial connection message
      controller.enqueue(
        `event: connected\ndata: ${JSON.stringify({ message: "SSE Connected", storeId })}\n\n`
      );

      // 2. Poll Database every 5 seconds
      const pollInterval = setInterval(async () => {
        try {
          const newActivities = await prisma.activityLog.findMany({
            where: {
              ...(storeId ? { storeId: storeId } : {}),
              createdAt: { gt: lastCreatedAt }
            },
            include: {
              store: { select: { id: true, label: true, shopDomain: true, isMaster: true } }
            },
            orderBy: { createdAt: 'asc' }
          });

          if (newActivities.length > 0) {
            // Update lastCreatedAt to the timestamp of the newest record found
            lastCreatedAt = newActivities[newActivities.length - 1].createdAt;

            // Push each new event to the client
            for (const activity of newActivities) {
              controller.enqueue(`event: new-activity\ndata: ${JSON.stringify(activity)}\n\n`);
            }
          }
        } catch (error) {
          console.error('[SSE Polling Error]:', error);
        }
      }, 5000);

      // 3. Heartbeat every 30 seconds to prevent connection timeouts
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(`event: ping\ndata: {"message": "heartbeat"}\n\n`);
        } catch (e) {
          // Ignored if stream is closed
        }
      }, 30000);

      // 4. Cleanup when the client disconnects or aborts the request
      req.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch (e) {
          // Ignore
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
