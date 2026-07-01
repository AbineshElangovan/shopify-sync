"use client";
import React from 'react';
import { Filters as PolarisFilters } from '@shopify/polaris';

export interface FilterProps {
  [key: string]: any;
}

export function Filter(props: FilterProps) {
  return (
    <PolarisFilters {...props} />
  );
}
