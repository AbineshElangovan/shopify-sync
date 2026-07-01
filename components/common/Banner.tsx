"use client";
import React from 'react';
import { Banner as PolarisBanner } from '@shopify/polaris';

export type BannerProps = React.ComponentProps<typeof PolarisBanner>;

export function Banner(props: BannerProps) {
  return (
    <PolarisBanner {...props} />
  );
}
