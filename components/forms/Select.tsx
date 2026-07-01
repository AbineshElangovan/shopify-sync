"use client";
import React from 'react';
import { Select as PolarisSelect } from '@shopify/polaris';

export type SelectProps = React.ComponentProps<typeof PolarisSelect>;

export function Select(props: SelectProps) {
  return (
    <PolarisSelect {...props} />
  );
}
