"use client";
import React from 'react';
import { Card as PolarisCard } from '@shopify/polaris';

export interface CardProps {
  [key: string]: any;
}

export function Card(props: CardProps) {
  return (
    <PolarisCard {...props} />
  );
}
