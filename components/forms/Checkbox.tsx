"use client";
import React from 'react';
import { Checkbox as PolarisCheckbox } from '@shopify/polaris';

export interface CheckboxProps {
  [key: string]: any;
}

export function Checkbox(props: CheckboxProps) {
  return (
    <PolarisCheckbox {...props} />
  );
}
