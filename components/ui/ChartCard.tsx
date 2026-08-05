import React from 'react';
import { Card } from './Card';

export interface ChartCardProps {
  title?: string;
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartCard({ title, description, headerAction, children }: ChartCardProps) {
  return (
    <Card title={title} description={description} headerAction={headerAction} padding="24px">
      <div style={{ width: '100%', height: '300px' }}>
        {children}
      </div>
    </Card>
  );
}
