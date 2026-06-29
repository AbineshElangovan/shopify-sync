
'use client'
import { BlockStack } from '@shopify/polaris'
import type { ComponentType } from 'react'

interface StatCardProps {
  label: string
  value: string
  bg: string
  icon: ComponentType<{ width?: number; height?: number; fill?: string }>
}

export default function StatCard({ label, value, bg, icon: Icon }: StatCardProps) {
  return (
    <div className={bg + ' rounded-xl px-6 py-7 flex items-center justify-between shadow-sm'}>
      <BlockStack gap="100">
        <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">{label}</span>
        <span className="text-white text-4xl font-bold">{value}</span>
      </BlockStack>
      <div className="text-white/70">
        <Icon width={32} height={32} fill="currentColor" />
      </div>
    </div>
  )
}
