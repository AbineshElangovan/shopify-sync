"use client";
import React from 'react';
import { ProgressBar as PolarisProgressBar } from '@shopify/polaris';

export interface LoadingProps {
  [key: string]: any;
}

export function Loading(props: LoadingProps) {
  return (
    <PolarisProgressBar {...props} />
  );
}
