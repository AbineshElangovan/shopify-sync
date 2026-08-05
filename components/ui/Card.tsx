import React from 'react';

export interface CardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  padding?: string;
  headerAction?: React.ReactNode;
}

export function Card({ title, description, children, padding = '24px', headerAction }: CardProps) {
  return (
    <div className="ys-card">
      {(title || description || headerAction) && (
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {title && <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>}
            {description && <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{description}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div style={{ padding }}>
        {children}
      </div>
    </div>
  );
}
