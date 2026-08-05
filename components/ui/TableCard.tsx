import React from 'react';
import { Card } from './Card';

export interface TableCardProps {
  title?: string;
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function TableCard({ title, description, headerAction, children }: TableCardProps) {
  return (
    <Card title={title} description={description} headerAction={headerAction} padding="0">
      {/* 
        This div ensures any tables inside it stretch completely to the edges 
        and have a subtle white background matching the card.
      */}
      <div className="w-full overflow-x-auto bg-white rounded-b-2xl">
        {children}
      </div>
    </Card>
  );
}
