"use client";

import React, { useEffect, useState } from "react";
import { useTimezone } from "../providers/TimezoneContext";

interface LocalizedDateProps {
  date: string | Date | null | undefined;
  format?: 'date' | 'time' | 'datetime';
  className?: string;
}

export const LocalizedDate: React.FC<LocalizedDateProps> = ({ date, format = 'date', className }) => {
  const { timezone } = useTimezone();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!date) {
    return <span className={className}>N/A</span>;
  }

  // Handle server-side rendering mismatch by returning a placeholder or empty string during SSR
  if (!mounted) {
    return <span className={className}></span>;
  }

  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return <span className={className}>Invalid Date</span>;
    }

    let formattedString = '';

    if (format === 'date') {
      formattedString = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      }).format(d);
    } else if (format === 'time') {
      formattedString = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      }).format(d);
    } else {
      formattedString = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      }).format(d);
    }

    return <span className={className}>{formattedString}</span>;
  } catch (e) {
    console.error("Error formatting date:", e);
    return <span className={className}>Error</span>;
  }
};
