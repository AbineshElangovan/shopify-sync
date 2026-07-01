"use client";
import React from 'react';
import { Pagination as PolarisPagination } from '@shopify/polaris';

export type PaginationProps = React.ComponentProps<typeof PolarisPagination>;

export function Pagination(props: PaginationProps) {
  return (
    <PolarisPagination {...props} />
  );
}
