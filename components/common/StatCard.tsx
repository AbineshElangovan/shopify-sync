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
      className="rounded-[14px] p-5.5 text-white shadow-lg transition-all duration-200 cursor-default h-full flex flex-col gap-4 hover:-translate-y-1 hover:shadow-2xl"
    >
      {/* Top row: label + icon */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold opacity-85 m-0 uppercase tracking-wider">
            {label}
          </p>
          {description && (
            <p className="text-[10px] opacity-65 mt-0.5 max-w-[160px] leading-tight">
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div
            style={{ backgroundColor: iconBg }}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          >
            <Icon source={icon} />
          </div>
        )}
      </div>

      {/* Value */}
      <div>
        <p className="text-4xl md:text-5xl font-extrabold m-0 leading-none">
          {value}
        </p>
      </div>
    </div>
  );
}
