"use client";
import React from 'react';
import { TextField as PolarisTextField } from '@shopify/polaris';

export type SearchBarProps = React.ComponentProps<typeof PolarisTextField>;

export function SearchBar(props: SearchBarProps) {
  return (
    <PolarisTextField {...props} />
  );
}
