"use client";
import React from 'react';
import { TextField as PolarisTextField } from '@shopify/polaris';

export interface SearchBarProps {
  [key: string]: any;
}

export function SearchBar(props: SearchBarProps) {
  return (
    <PolarisTextField {...props} />
  );
}
