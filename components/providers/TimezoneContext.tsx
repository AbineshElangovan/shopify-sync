"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface TimezoneContextType {
  timezone: string;
  setTimezone: (timezone: string) => void;
}

const TimezoneContext = createContext<TimezoneContextType>({ 
  timezone: "UTC",
  setTimezone: () => {} 
});

export const TimezoneProvider = ({ children }: { children: React.ReactNode }) => {
  const [timezone, setTimezoneState] = useState<string>("UTC");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    try {
      const savedTimezone = localStorage.getItem("preferred_timezone");
      
      if (savedTimezone) {
        setTimezoneState(savedTimezone);
      } else {
        const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detectedTimezone) {
          setTimezoneState(detectedTimezone);
        }
      }
    } catch (e) {
      console.warn("Could not detect timezone, falling back to UTC.", e);
    }
  }, []);

  const setTimezone = (newTimezone: string) => {
    setTimezoneState(newTimezone);
    localStorage.setItem("preferred_timezone", newTimezone);
  };

  if (!isClient) {
    // Avoid hydration mismatches by returning children with default or null
    // But since some children might rely on timezone early, we just provide UTC initially
    // Alternatively, just return the provider with UTC and update it on mount
  }

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
};

export const useTimezone = () => useContext(TimezoneContext);
