"use client";
import React from 'react';
import { Frame as PolarisFrame } from '@shopify/polaris';

export type DrawerProps = React.ComponentProps<typeof PolarisFrame>;

export function Drawer(props: DrawerProps) {
  return (
    <PolarisFrame {...props} />
  );
}
