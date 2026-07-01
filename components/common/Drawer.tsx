"use client";
import React from 'react';
import { Frame as PolarisFrame } from '@shopify/polaris';

export interface DrawerProps {
  [key: string]: any;
}

export function Drawer(props: DrawerProps) {
  return (
    <PolarisFrame {...props} />
  );
}
