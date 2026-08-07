'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function LiveRefresher() {
  const router = useRouter();
  const retryCount = useRef(0);
  const maxRetries = 10;
  const retryDelay = 2000;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      // Connect without a storeId so it listens to ALL activities globally
      eventSource = new EventSource('/api/activity/stream');

      eventSource.onopen = () => {
        retryCount.current = 0; // Reset retries on successful connection
      };

      eventSource.addEventListener('new-activity', (event) => {
        console.log('[LiveRefresher] ⚡ New activity received from SSE!', event.data);
        console.log('[LiveRefresher] 🔄 Refreshing page data...');
        // Force Next.js to re-fetch Server Components (like the Dashboard) quietly in the background
        router.refresh();
      });

      eventSource.onerror = () => {
        eventSource?.close();
        if (retryCount.current < maxRetries) {
          retryCount.current++;
          reconnectTimeout = setTimeout(connectSSE, retryDelay * retryCount.current);
        }
      };
    };

    connectSSE();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
    };
  }, [router]);

  return null; // Invisible component
}
