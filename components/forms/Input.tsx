"use client";
import React from 'react';
import { TextField as PolarisTextField } from '@shopify/polaris';

export type InputProps = React.ComponentProps<typeof PolarisTextField>;

export function Input(props: InputProps) {
  return (
    <PolarisTextField {...props} />
  );
}
