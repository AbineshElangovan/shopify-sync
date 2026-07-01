"use client";
import React from 'react';
import { Spinner as PolarisSpinner } from '@shopify/polaris';

export interface SpinnerProps {
  [key: string]: any;
}

export function Spinner(props: SpinnerProps) {
  return (
    <PolarisSpinner {...props} />
  );
}
