"use client";
import React from 'react';
import { Pagination as PolarisPagination } from '@shopify/polaris';

export interface PaginationProps {
  [key: string]: any;
}

export function Pagination(props: PaginationProps) {
  return (
    <PolarisPagination {...props} />
  );
}
