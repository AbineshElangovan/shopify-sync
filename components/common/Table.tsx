"use client";
import React from 'react';
import { IndexTable as PolarisIndexTable } from '@shopify/polaris';

export type TableProps = React.ComponentProps<typeof PolarisIndexTable>;

export function Table(props: TableProps) {
  return (
    <PolarisIndexTable {...props} />
  );
}
