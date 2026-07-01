"use client";
import React from 'react';
import { RadioButton as PolarisRadioButton } from '@shopify/polaris';

export interface RadioProps {
  [key: string]: any;
}

export function Radio(props: RadioProps) {
  return (
    <PolarisRadioButton {...props} />
  );
}
