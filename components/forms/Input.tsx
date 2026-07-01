"use client";
import React from 'react';
import { TextField as PolarisTextField } from '@shopify/polaris';

export interface InputProps {
  [key: string]: any;
}

export function Input(props: InputProps) {
  return (
    <PolarisTextField {...props} />
  );
}
