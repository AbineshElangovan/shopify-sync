"use client";
import React from 'react';
import { ChoiceList as PolarisChoiceList } from '@shopify/polaris';

export type ToggleProps = React.ComponentProps<typeof PolarisChoiceList>;

export function Toggle(props: ToggleProps) {
  return (
    <PolarisChoiceList {...props} />
  );
}
