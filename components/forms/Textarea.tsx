"use client";
import React from 'react';
import { TextField as PolarisTextField } from '@shopify/polaris';

export type TextareaProps = React.ComponentProps<typeof PolarisTextField>;

export function Textarea(props: TextareaProps) {
  return (
    <PolarisTextField  multiline={4} {...props} />
  );
}
