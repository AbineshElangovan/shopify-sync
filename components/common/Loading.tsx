"use client";
import React from 'react';
import { ProgressBar as PolarisProgressBar } from '@shopify/polaris';

export type LoadingProps = React.ComponentProps<typeof PolarisProgressBar>;

export function Loading(props: LoadingProps) {
  return (
    <PolarisProgressBar {...props} />
  );
}
