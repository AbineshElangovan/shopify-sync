"use client";
import React from 'react';
import { EmptyState as PolarisEmptyState } from '@shopify/polaris';

export type EmptyStateProps = React.ComponentProps<typeof PolarisEmptyState>;

export function EmptyState(props: EmptyStateProps) {
  return (
    <PolarisEmptyState {...props} />
  );
}
