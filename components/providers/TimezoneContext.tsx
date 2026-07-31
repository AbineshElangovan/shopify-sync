"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface TimezoneContextType {
  timezone: string;
}

const TimezoneContext = createContext<TimezoneContextType>({ timezone: "UTC" });

export const TimezoneProvider = ({ children }: { children: React.ReactNode }) => {
  const [timezone, setTimezone] = useState<string>("UTC");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    try {
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectedTimezone) {
        setTimezone(detectedTimezone);
      }
    } catch (e) {
      console.warn("Could not detect timezone, falling back to UTC.", e);
    }
  }, []);

  if (!isClient) {
    // Avoid hydration mismatches by returning children with default or null
    // But since some children might rely on timezone early, we just provide UTC initially
    // Alternatively, just return the provider with UTC and update it on mount
  }

  return (
    <TimezoneContext.Provider value={{ timezone }}>
      {children}
    </TimezoneContext.Provider>
  );
};

export const useTimezone = () => useContext(TimezoneContext);
