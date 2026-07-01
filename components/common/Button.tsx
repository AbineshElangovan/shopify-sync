"use client";
import React from 'react';
import { Button as PolarisButton } from '@shopify/polaris';

export type ButtonProps = React.ComponentProps<typeof PolarisButton>;

export function Button(props: ButtonProps) {
  return (
    <PolarisButton {...props} />
  );
}
