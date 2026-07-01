"use client";
import React from 'react';
import { Banner as PolarisBanner } from '@shopify/polaris';

export interface BannerProps {
  [key: string]: any;
}

export function Banner(props: BannerProps) {
  return (
    <PolarisBanner {...props} />
  );
}
