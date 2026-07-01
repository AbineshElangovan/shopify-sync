"use client";
import React from 'react';
import { Avatar as PolarisAvatar } from '@shopify/polaris';

export type AvatarProps = React.ComponentProps<typeof PolarisAvatar>;

export function Avatar(props: AvatarProps) {
  return (
    <PolarisAvatar {...props} />
  );
}
