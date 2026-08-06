"use client";
import React, { useState, useRef, useEffect } from "react";

export interface CustomSelectProps {
  label?: string;
  labelHidden?: boolean;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function CustomSelect({ label, labelHidden, options, value, onChange }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full text-left" ref={containerRef}>
      {label && !labelHidden && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] text-gray-700 bg-white cursor-pointer outline-none focus:border-[#0db69d] focus:ring-1 focus:ring-[#0db69d] transition-colors flex justify-between items-center shadow-sm hover:bg-gray-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{selectedOption?.label || "Select..."}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <ul className="py-1">
            {options.map((opt) => (
              <li
                key={opt.value}
                className={`px-3 py-2 text-[13px] cursor-pointer transition-colors ${
                  value === opt.value
                    ? "bg-[#0db69d] text-white"
                    : "text-gray-700 hover:bg-[#0db69d] hover:text-white"
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
