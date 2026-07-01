"use client";
import React from 'react';
import { Modal as PolarisModal } from '@shopify/polaris';

export type ConfirmationDialogProps = React.ComponentProps<typeof PolarisModal>;

export function ConfirmationDialog(props: ConfirmationDialogProps) {
  return (
    <PolarisModal {...props} />
  );
}
