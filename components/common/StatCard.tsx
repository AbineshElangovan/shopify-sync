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
      style={{ background: gradient }}
      className="rounded-[14px] p-[22px_20px] text-white shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all duration-200 cursor-default h-full flex flex-col gap-4 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
    >
      {/* Top row: label + icon */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[0.78rem] font-medium opacity-85 m-0 uppercase tracking-[0.05em]">
            {label}
          </p>
          {description && (
            <p className="text-[0.72rem] opacity-65 mt-0.5 max-w-[160px]">
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div
            style={{ backgroundColor: iconBg }}
            className="w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0"
          >
            <Icon source={icon} />
          </div>
        )}
      </div>

      {/* Value */}
      <div>
        <p className="text-[32px] font-black m-0 leading-none">
          {value}
        </p>
      </div>
    </div>
  );
}
