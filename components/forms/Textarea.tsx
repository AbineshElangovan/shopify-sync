"use client";
import React from 'react';
import { TextField as PolarisTextField } from '@shopify/polaris';

export interface TextareaProps {
  [key: string]: any;
}

export function Textarea(props: TextareaProps) {
  return (
    <PolarisTextField  multiline={4} {...props} />
  );
}
