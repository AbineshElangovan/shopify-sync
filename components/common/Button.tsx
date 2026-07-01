"use client";
import React from 'react';
import { Button as PolarisButton } from '@shopify/polaris';

export interface ButtonProps {
  [key: string]: any;
}

export function Button(props: ButtonProps) {
  return (
    <PolarisButton {...props} />
  );
}
