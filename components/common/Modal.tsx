"use client";
import React from 'react';
import { Modal as PolarisModal } from '@shopify/polaris';

export interface ModalProps {
  [key: string]: any;
}

export function Modal(props: ModalProps) {
  return (
    <PolarisModal {...props} />
  );
}
