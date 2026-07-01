"use client";
import React from 'react';
import { IndexTable as PolarisIndexTable } from '@shopify/polaris';

export interface TableProps {
  [key: string]: any;
}

export function Table(props: TableProps) {
  return (
    <PolarisIndexTable {...props} />
  );
}
