import React from 'react';

export const ThemedSection = ({
  title,
  description,
  bgColor,
  borderColor,
  stripeColor,
  titleColor,
  descColor,
  children
}: {
  title: string;
  description?: string;
  bgColor: string;
  borderColor: string;
  stripeColor: string;
  titleColor: string;
  descColor?: string;
  children: React.ReactNode;
}) => (
  <div style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
    <div style={{ marginBottom: '20px', borderLeft: `4px solid ${stripeColor}`, paddingLeft: '12px' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: titleColor, margin: 0 }}>
        {title}
      </h2>
      {description && (
        <p style={{ marginTop: '4px', color: descColor, fontSize: '0.875rem' }}>
          {description}
        </p>
      )}
    </div>
    {children}
  </div>
);
