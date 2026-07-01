"use client";
import React from 'react';
import { Spinner as PolarisSpinner } from '@shopify/polaris';

export type LoadingProps = React.ComponentProps<typeof PolarisSpinner>;

export function Loading(props: LoadingProps) {
  return (
    <PolarisSpinner size="large" {...props} />
  );
}
