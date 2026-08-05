'use client';
import React from 'react';
import { Icon } from '@shopify/polaris';

export interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ComponentProps<typeof Icon>['source'];
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  loading?: boolean;
}

export function StatCard({ title, value, description, icon, color = 'primary', loading }: StatCardProps) {
  const colorMap = {
    primary: { bg: 'var(--color-primary-light)', text: 'var(--color-primary-dark)' },
    success: { bg: '#dcfce7', text: 'var(--color-success)' },
    warning: { bg: '#fef3c7', text: 'var(--color-warning)' },
    danger: { bg: '#fee2e2', text: 'var(--color-danger)' },
    info: { bg: '#dbeafe', text: 'var(--color-info)' }
  };

  const theme = colorMap[color];

  return (
    <div className="ys-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', transition: 'box-shadow 0.2s ease, transform 0.2s ease' }}
         onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)'; }}
         onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>
            {title}
          </h3>
          {description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '4px' }}>
              {description}
            </p>
          )}
        </div>
        
        {icon && (
          <div style={{ 
            backgroundColor: theme.bg, 
            color: theme.text,
            width: '40px', 
            height: '40px', 
            borderRadius: 'var(--radius-sm)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            flexShrink: 0 
          }}>
            <Icon source={icon} tone="base" />
          </div>
        )}
      </div>

      <div>
        {loading ? (
          <div style={{ height: '36px', width: '60%', backgroundColor: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }} className="animate-pulse" />
        ) : (
          <p style={{ color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 700, margin: 0, lineHeight: 1 }}>
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
