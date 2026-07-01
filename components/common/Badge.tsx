"use client";
import React from 'react';
import { Badge as PolarisBadge } from '@shopify/polaris';

export interface BadgeProps {
  [key: string]: any;
}

export function Badge(props: BadgeProps) {
  return (
    <PolarisBadge {...props} />
  );
}
