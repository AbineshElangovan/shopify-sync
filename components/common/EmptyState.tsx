"use client";
import React from 'react';
import { EmptyState as PolarisEmptyState } from '@shopify/polaris';

export interface EmptyStateProps {
  [key: string]: any;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <PolarisEmptyState {...props} />
  );
}
