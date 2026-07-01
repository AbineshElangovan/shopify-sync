"use client";
import React from 'react';
import { Filters as PolarisFilters } from '@shopify/polaris';

export type FilterProps = React.ComponentProps<typeof PolarisFilters>;

export function Filter(props: FilterProps) {
  return (
    <PolarisFilters {...props} />
  );
}
