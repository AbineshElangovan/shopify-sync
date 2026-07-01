"use client";
import React from 'react';
import { Modal as PolarisModal } from '@shopify/polaris';

export interface ConfirmationDialogProps {
  [key: string]: any;
}

export function ConfirmationDialog(props: ConfirmationDialogProps) {
  return (
    <PolarisModal {...props} />
  );
}
