"use client";
import React, { useState, useEffect } from 'react';

export function Loading({ label = "Loading..." }: { label?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 250);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '60vh', marginTop: '10vh', gap: 14 }}>
      <style>{`
        @keyframes sync-spin { to { transform: rotate(360deg); } }
        .ys-sync-ring {
          width: 44px; height: 44px;
          border-radius: 50%;
          border: 4px solid #e5e7eb;
          border-top-color: #0db69d;
          animation: sync-spin 0.75s linear infinite;
        }
      `}</style>
      <div className="ys-sync-ring" />
      <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>{label}</p>
    </div>
  );
}
