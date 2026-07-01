"use client";
import React from 'react';
import { Toast as PolarisToast } from '@shopify/polaris';

export interface ToastProps {
  [key: string]: any;
}

export function Toast(props: ToastProps) {
  return (
    <PolarisToast {...props} />
  );
}
