// Ported from Tremor Raw / Tremor Insights template (MIT License).
// Source: src/lib/utils.ts, https://github.com/tremorlabs/tremor-insights
// Converted for Vite + Tailwind v4 (no syntax changes required here).

import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cx(...args: ClassValue[]) {
  return twMerge(clsx(...args));
}

// Tremor Raw focusInput [v0.0.1]
export const focusInput = [
  'focus:ring-2',
  'focus:ring-blue-200 focus:dark:ring-blue-700/30',
  'focus:border-blue-500 focus:dark:border-blue-700',
];

// Tremor Raw focusRing [v0.0.1]
export const focusRing = [
  'outline outline-offset-2 outline-0 focus-visible:outline-2',
  'outline-blue-500 dark:outline-blue-500',
];

// Tremor Raw hasErrorInput [v0.0.1]
export const hasErrorInput = [
  'ring-2',
  'border-red-500 dark:border-red-700',
  'ring-red-200 dark:ring-red-700/30',
];
