"use client";
import React from 'react';
import { Avatar as PolarisAvatar } from '@shopify/polaris';

export interface AvatarProps {
  [key: string]: any;
}

export function Avatar(props: AvatarProps) {
  return (
    <PolarisAvatar {...props} />
  );
}
