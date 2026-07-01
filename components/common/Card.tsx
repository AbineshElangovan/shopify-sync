"use client";
import React from 'react';
import { Card as PolarisCard } from '@shopify/polaris';

export type CardProps = React.ComponentProps<typeof PolarisCard>;

export function Card(props: CardProps) {
  return (
    <PolarisCard {...props} />
  );
}
