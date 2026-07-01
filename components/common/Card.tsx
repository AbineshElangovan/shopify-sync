'use client';
import React from 'react';
import { Card as PolarisCard, Text, BlockStack, InlineStack, Icon } from '@shopify/polaris';
import type { IconSource } from '@shopify/polaris';

export interface CardProps extends React.ComponentProps<typeof PolarisCard> {
  icon?: IconSource;
  iconBgColor?: string;      // Tailwind class, e.g. 'bg-purple-100'
  description?: string;
  lastUpdated?: string;
  value?: string | number;
}

export function Card({
  icon: IconComponent,
  iconBgColor = 'bg-gray-100',
  description,
  lastUpdated,
  value,
  children,
  ...props
}: CardProps) {
  if (IconComponent && value !== undefined) {
    return (
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '0 0 12px 12px',
          border: '1px solid #e5e7eb',
          borderTop: 'none',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          cursor: 'default',
        }}
        className="group hover:-translate-y-1 hover:shadow-lg"
      >
        <PolarisCard {...props}>
          <div style={{ padding: '18px 20px' }}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" tone="subdued">
                    {description}
                  </Text>
                </BlockStack>
                <div
                  className={iconBgColor}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon source={IconComponent} />
                </div>
              </InlineStack>

              <Text variant="heading2xl" as="p" fontWeight="bold">
                {value}
              </Text>

              {lastUpdated && (
                <Text variant="bodySm" as="p" tone="subdued">
                  {lastUpdated}
                </Text>
              )}
            </BlockStack>
          </div>
        </PolarisCard>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <PolarisCard {...props}>{children}</PolarisCard>
    </div>
  );
}
