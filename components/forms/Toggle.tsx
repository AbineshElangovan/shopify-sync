"use client";
import React from 'react';
import { ChoiceList as PolarisChoiceList } from '@shopify/polaris';

export interface ToggleProps {
  [key: string]: any;
}

export function Toggle(props: ToggleProps) {
  return (
    <PolarisChoiceList {...props} />
  );
}
