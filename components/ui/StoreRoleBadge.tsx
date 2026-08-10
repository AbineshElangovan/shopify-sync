'use client';
import React from 'react';
import { useStoreContext } from '@/components/providers/StoreProvider';

export function StoreRoleBadge() {
  const { isMaster, isStandalone, loading } = useStoreContext();

  if (loading) return null;

  if (isStandalone) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-800 text-white uppercase tracking-wider border border-blue-900 shadow-sm">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L22 7L12 12L2 7L12 2ZM12 14.5L20 10.5L22 11.5L12 16.5L2 11.5L4 10.5L12 14.5ZM12 19L20 15L22 16L12 21L2 16L4 15L12 19Z"/>
        </svg>
        Standalone
      </span>
    );
  }

  return isMaster ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#064e3b] text-white uppercase tracking-wider border border-[#022c22] shadow-sm">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
      Master
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#047857] text-white uppercase tracking-wider border border-[#065f46] shadow-sm">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-13.35a4.5 4.5 0 0 0-6.364 0L10.553 3.42m-1.242 7.244a4.5 4.5 0 0 0-1.242-7.244" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      Connected
    </span>
  );
}
