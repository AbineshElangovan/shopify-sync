"use client";
import React from 'react';
import { Select as PolarisSelect } from '@shopify/polaris';

export interface SelectProps {
  [key: string]: any;
}

export function Select(props: SelectProps) {
  return (
    <PolarisSelect {...props} />
  );
}
