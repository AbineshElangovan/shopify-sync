'use client';
import React from 'react';
import { Icon } from '@shopify/polaris';

export interface StatCardProps {
  label: string;
  description?: string;
  value: string;
  icon?: React.ComponentProps<typeof Icon>['source'];
  gradient: string;        // CSS gradient string
  iconBg?: string;          // icon circle bg (defaults to rgba(255,255,255,0.2))
}

export function StatCard({
  label,
  description,
  value,
  icon,
  gradient,

  iconBg = 'rgba(255,255,255,0.2)',
}: StatCardProps) {
  return (
    <div
      style={{
        background: gradient,
        borderRadius: '14px',
        padding: '22px 20px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        color: '#fff',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'default',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
      className="stat-card"
    >
      <style>{`
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important;
        }
      `}</style>


      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '0.78rem', fontWeight: 500, opacity: 0.85, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </p>
          {description && (
            <p style={{ fontSize: '0.72rem', opacity: 0.65, margin: '2px 0 0', maxWidth: '160px' }}>
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              backgroundColor: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon source={icon} />
          </div>
        )}
      </div>

      {/* Value */}
      <div>
        <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, lineHeight: 1 }}>
          {value}
        </p>
      </div>
    </div>
  );
}
