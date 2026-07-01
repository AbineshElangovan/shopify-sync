"use client";
import React from 'react';
import { Toast as PolarisToast } from '@shopify/polaris';

export type ToastProps = React.ComponentProps<typeof PolarisToast>;

export function Toast(props: ToastProps) {
  return (
    <PolarisToast {...props} />
  );
}
