/** Strict UTC date/time parsing with real calendar validation (no rollover). */

export type DateTimeResult =
  | { ok: true; iso: string; ms: number }
  | { ok: false; error: string };

const STAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?\s*(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  const table = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[m - 1] ?? 0;
}

export function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || y < 1 || y > 9999) return false;
  if (!Number.isInteger(m) || m < 1 || m > 12) return false;
  return Number.isInteger(d) && d >= 1 && d <= daysInMonth(y, m);
}

/**
 * Parse an ISO timestamp that must carry an explicit timezone (Z or +HH:MM).
 * Rejects missing timezones, out-of-range fields, and rolled-over dates.
 * Returns the UTC-normalized ISO string.
 */
export function parseStrictTimestamp(raw: string): DateTimeResult {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Missing timestamp.' };
  const m = STAMP_RE.exec(s);
  if (!m) {
    if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
      return { ok: false, error: `Malformed timestamp "${s}". Use 2025-03-01T10:00:00Z.` };
    }
    return { ok: false, error: `Missing timezone in "${s}". Use an explicit Z or +HH:MM offset.` };
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const se = Number(m[6]);
  const tz = m[8];
  if (!isValidCalendarDate(y, mo, d)) {
    return { ok: false, error: `Invalid calendar date in "${s}" (no rollover allowed).` };
  }
  if (h > 23 || mi > 59 || se > 59) {
    return { ok: false, error: `Invalid time fields in "${s}".` };
  }
  if (tz !== 'Z') {
    const oh = Number(tz.slice(1, 3));
    const om = Number(tz.slice(4, 6));
    if (oh > 23 || om > 59) return { ok: false, error: `Invalid UTC offset in "${s}".` };
  }
  // Exact UTC construction from validated fields: no rollover is possible here
  // because every field was range-checked above, including the calendar date.
  const offsetMs =
    tz === 'Z' ? 0 : (tz[0] === '-' ? 1 : -1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(4, 6))) * 60000;
  const fracMs = m[7] ? Number((m[7] + '000').slice(0, 3)) : 0;
  const expected = Date.UTC(y, mo - 1, d, h, mi, se, fracMs) + offsetMs;
  const ms = Date.parse(s.replace(' ', 'T'));
  if (Number.isNaN(ms)) return { ok: false, error: `Unparseable timestamp "${s}".` };
  if (ms !== expected) {
    return { ok: false, error: `Invalid calendar timestamp "${s}" (no rollover allowed).` };
  }
  return { ok: true, iso: new Date(ms).toISOString(), ms };
}

export type DateResult = { ok: true; date: string } | { ok: false; error: string };

/**
 * Parse a calendar date (YYYY-MM-DD) or a full strict timestamp (date part kept).
 * Unknown stays unknown: empty input is an error here, callers decide.
 */
export function parseStrictDate(raw: string): DateResult {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Missing date.' };
  const m = DATE_RE.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!isValidCalendarDate(y, mo, d)) {
      return { ok: false, error: `Invalid calendar date "${s}" (no rollover allowed).` };
    }
    return { ok: true, date: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const t = parseStrictTimestamp(s);
  if (!t.ok) return t;
  return { ok: true, date: t.iso.slice(0, 10) };
}

/** A bare hostname (no scheme, path, port, or credentials). */
export function isValidHostname(raw: string): boolean {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s || s.length > 253 || /\s/.test(s)) return false;
  if (s === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    return s.split('.').every((p) => Number(p) >= 0 && Number(p) <= 255);
  }
  const labels = s.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((l) => l.length >= 1 && l.length <= 63 && /^[a-z0-9-]+$/.test(l) && !l.startsWith('-') && !l.endsWith('-'))) {
    return false;
  }
  const tld = labels[labels.length - 1];
  return /^(xn--[a-z0-9-]+|[a-z]{2,})$/.test(tld);
}

/** Real HTTP(S) URL with a valid hostname. Rejects prefixes like `https://` alone. */
export function isValidHttpUrl(raw: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s || /\s/.test(s)) return false;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost') return true;
  // IPv4 literal.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host.split('.').every((p) => Number(p) >= 0 && Number(p) <= 255);
  }
  // Dotted hostname with alphabetic TLD (punycode xn-- allowed).
  if (!/^(?!-)(?!.*--$)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z0-9-]+$/i.test(host)) return false;
  if (/^[.-]|[.-]$/.test(host)) return false;
  const tld = host.slice(host.lastIndexOf('.') + 1);
  if (!/^(xn--[a-z0-9-]+|[a-z]{2,})$/i.test(tld)) return false;
  return true;
}
