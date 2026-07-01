"use client";
import React from 'react';
import { Badge as PolarisBadge } from '@shopify/polaris';

export type BadgeProps = React.ComponentProps<typeof PolarisBadge>;

export function Badge(props: BadgeProps) {
  return (
    <PolarisBadge {...props} />
  );
}
