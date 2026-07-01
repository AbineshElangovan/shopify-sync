"use client";
import React from 'react';
import { Spinner as PolarisSpinner } from '@shopify/polaris';

export type SpinnerProps = React.ComponentProps<typeof PolarisSpinner>;

export function Spinner(props: SpinnerProps) {
  return (
    <PolarisSpinner {...props} />
  );
}
