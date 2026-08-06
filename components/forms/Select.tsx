"use client";
import React from 'react';
import { CustomSelect } from '@/components/common/CustomSelect';

export type SelectProps = React.ComponentProps<typeof CustomSelect>;

export function Select(props: SelectProps) {
  return (
    <CustomSelect {...props} />
  );
}
