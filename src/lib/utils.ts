import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or privacy mode: keep in-memory behavior, do not throw
  }
}

import { parseCSVTable } from './csv';

/**
 * Neutralize spreadsheet formula injection in CSV exports.
 * Prefixes when the first meaningful character is a formula trigger
 * (=, +, -, @), covering leading-whitespace bypasses, and when the value
 * carries control characters. Delimiter characters (comma, quote, newlines,
 * tabs) are preserved safely through quoting in toCSV.
 */
// eslint-disable-next-line no-control-regex -- intentional: spreadsheet formula guard must detect control characters
const FORMULA_START = /^[\s\uFEFF\x00-\x1f]*[=+\-@]/;
// eslint-disable-next-line no-control-regex -- intentional: spreadsheet formula guard must detect control characters
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export function csvSafe(value: string): string {
  const v = String(value ?? '');
  if (FORMULA_START.test(v) || CONTROL_CHARS.test(v)) return `'${v}`;
  return v;
}

export function toCSV(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = csvSafe(c);
          return /[",\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');
}

/**
 * CSV import parsing backed by the record-level parser: quoted multiline
 * fields, escaped quotes, CRLF/BOM, case-normalized headers, duplicate
 * header and row-width errors with physical row numbers. All parse errors
 * are surfaced; only valid records become rows.
 */
export function parseCSV(text: string): {
  header: string[];
  rows: Record<string, string>[];
  rowStarts: number[];
  errors: string[];
  skippedEmpty: number;
} {
  return parseCSVTable(text);
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
