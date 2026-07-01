/* ─────────────────────────────────────────────────────────
   Reusable page-skeleton loader — works in any loading.tsx
   ───────────────────────────────────────────────────────── */
export function PageLoader({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ position: 'relative', minHeight: '80vh' }}>
      <style>{`
        @keyframes sk-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .sk-box {
          border-radius: 6px;
          background: #e5e7eb;
          animation: sk-pulse 1.5s ease-in-out infinite;
        }
        @keyframes sk-spin { to { transform: rotate(360deg); } }
        .sk-spinner {
          width: 52px; height: 52px;
          border: 5px solid #e5e7eb;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: sk-spin 0.75s linear infinite;
        }
        @keyframes sk-ping {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.9); opacity: 0;   }
        }
        .sk-ping {
          position: absolute;
          width: 52px; height: 52px;
          border: 3px solid #6366f1;
          border-radius: 50%;
          animation: sk-ping 1.2s ease-out infinite;
        }
      `}</style>

      {/* ── Centered spinner overlay ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        zIndex: 10,
      }}>
        {/* Spinner with ping ring */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="sk-ping" />
          <div className="sk-spinner" />
        </div>

        {/* Text */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#374151' }}>Loading…</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Please wait while we fetch your data</p>
        </div>

        {/* Animated dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 7, height: 7,
                borderRadius: '50%',
                backgroundColor: '#6366f1',
                animation: `sk-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Blurred background skeleton ── */}
      <div style={{ padding: '32px', maxWidth: 1280, margin: '0 auto', opacity: 0.35, filter: 'blur(2px)', pointerEvents: 'none', userSelect: 'none' }}>

        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <div className="sk-box" style={{ height: 12, width: '55%', marginBottom: 14 }} />
              <div className="sk-box" style={{ height: 28, width: '40%', marginBottom: 10 }} />
              <div className="sk-box" style={{ height: 10, width: '70%' }} />
            </div>
          ))}
        </div>

        {/* Chart placeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <div className="sk-box" style={{ height: 14, width: '40%', marginBottom: 20 }} />
              <div className="sk-box" style={{ height: 180 }} />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex' }}>
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} style={{ flex: j === 0 ? '0 0 60px' : 1, padding: '12px 16px', background: '#ede9fe', borderRight: j < cols - 1 ? '1px solid #ddd6fe' : 'none' }}>
                <div className="sk-box" style={{ height: 11, width: '70%', background: '#c4b5fd' }} />
              </div>
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ display: 'flex', borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8f9ff' }}>
              {Array.from({ length: cols }).map((_, j) => (
                <div key={j} style={{ flex: j === 0 ? '0 0 60px' : 1, padding: '13px 16px', borderRight: j < cols - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  {j === 0
                    ? <div className="sk-box" style={{ width: 38, height: 38, borderRadius: 6 }} />
                    : <div className="sk-box" style={{ height: 11, width: `${45 + (j * 19) % 45}%` }} />
                  }
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
