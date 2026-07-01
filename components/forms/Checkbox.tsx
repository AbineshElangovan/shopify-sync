"use client";
import React from 'react';
import { Checkbox as PolarisCheckbox } from '@shopify/polaris';

export type CheckboxProps = React.ComponentProps<typeof PolarisCheckbox>;

export function Checkbox(props: CheckboxProps) {
  return (
    <PolarisCheckbox {...props} />
  );
}
