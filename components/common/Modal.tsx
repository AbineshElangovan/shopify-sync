"use client";
import React from 'react';
import { Modal as PolarisModal } from '@shopify/polaris';

export type ModalProps = React.ComponentProps<typeof PolarisModal>;

export function Modal(props: ModalProps) {
  return (
    <PolarisModal {...props} />
  );
}
