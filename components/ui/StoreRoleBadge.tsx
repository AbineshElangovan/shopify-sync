'use client';
import React, { useEffect, useState } from 'react';
import { shopifyFetch } from '@/lib/shopify/Client';

export function StoreRoleBadge() {
  const [isMaster, setIsMaster] = useState<boolean | null>(null);

  useEffect(() => {
    shopifyFetch('/api/stores/current')
      .then(res => res.json())
      .then(data => setIsMaster(data.isMaster))
      .catch(() => {});
  }, []);

  if (isMaster === null) return null;

  return isMaster ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-green-700 text-white uppercase tracking-wider border border-green-800 shadow-sm">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
      Master
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-green-700 text-white uppercase tracking-wider border border-green-800 shadow-sm">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-13.35a4.5 4.5 0 0 0-6.364 0L10.553 3.42m-1.242 7.244a4.5 4.5 0 0 0-1.242-7.244" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      Connected
    </span>
  );
}
