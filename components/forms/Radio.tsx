"use client";
import React from 'react';
import { RadioButton as PolarisRadioButton } from '@shopify/polaris';

export type RadioProps = React.ComponentProps<typeof PolarisRadioButton>;

export function Radio(props: RadioProps) {
  return (
    <PolarisRadioButton {...props} />
  );
}
