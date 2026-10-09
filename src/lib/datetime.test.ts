import { describe, expect, it } from 'vitest';
import { isValidHostname, isValidHttpUrl, parseStrictDate, parseStrictTimestamp } from './datetime';

describe('parseStrictTimestamp', () => {
  it('accepts Zulu and normalizes to UTC ISO', () => {
    const r = parseStrictTimestamp('2025-03-01T10:00:00Z');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe('2025-03-01T10:00:00.000Z');
  });

  it('accepts valid offsets and normalizes to UTC', () => {
    const r = parseStrictTimestamp('2025-03-01T12:00:00+02:00');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe('2025-03-01T10:00:00.000Z');
  });

  it('rejects missing timezones', () => {
    expect(parseStrictTimestamp('2025-03-01T10:00:00').ok).toBe(false);
    expect(parseStrictTimestamp('2025-03-01').ok).toBe(false);
  });

  it('rejects rolled-over and impossible dates', () => {
    expect(parseStrictTimestamp('2025-02-30T10:00:00Z').ok).toBe(false);
    expect(parseStrictTimestamp('2025-13-01T10:00:00Z').ok).toBe(false);
    expect(parseStrictTimestamp('2025-03-01T25:00:00Z').ok).toBe(false);
    expect(parseStrictTimestamp('2025-03-01T10:61:00Z').ok).toBe(false);
  });

  it('accepts leap day and rejects non-leap Feb 29', () => {
    expect(parseStrictTimestamp('2024-02-29T10:00:00Z').ok).toBe(true);
    expect(parseStrictTimestamp('2025-02-29T10:00:00Z').ok).toBe(false);
  });

  it('rejects invalid offsets', () => {
    expect(parseStrictTimestamp('2025-03-01T10:00:00+25:00').ok).toBe(false);
    expect(parseStrictTimestamp('2025-03-01T10:00:00+02:99').ok).toBe(false);
  });
});

describe('parseStrictDate', () => {
  it('accepts real calendar dates', () => {
    expect(parseStrictDate('2025-03-01')).toEqual({ ok: true, date: '2025-03-01' });
  });

  it('rejects rollover dates like 2025-99-99 and 2025-02-30', () => {
    expect(parseStrictDate('2025-99-99').ok).toBe(false);
    expect(parseStrictDate('2025-02-30').ok).toBe(false);
    expect(parseStrictDate('03/01/2025').ok).toBe(false);
  });

  it('keeps unknown unknown: empty is an error', () => {
    expect(parseStrictDate('').ok).toBe(false);
  });
});

describe('isValidHostname', () => {
  it('accepts bare hostnames and rejects paths, ports, and schemes', () => {
    expect(isValidHostname('acme.example')).toBe(true);
    expect(isValidHostname('sub.acme.co.uk')).toBe(true);
    expect(isValidHostname('good.example/path')).toBe(false);
    expect(isValidHostname('good.example:8080')).toBe(false);
    expect(isValidHostname('https://good.example')).toBe(false);
    expect(isValidHostname('not a host')).toBe(false);
    expect(isValidHostname('-bad.example')).toBe(false);
  });
});

describe('isValidHttpUrl', () => {
  it('accepts real http/https URLs with hostnames', () => {
    expect(isValidHttpUrl('https://example.com/post')).toBe(true);
    expect(isValidHttpUrl('http://sub.example.co.uk:8080/a?b=c')).toBe(true);
  });

  it('rejects bare prefixes, non-http schemes, and bad hosts', () => {
    expect(isValidHttpUrl('https://')).toBe(false);
    expect(isValidHttpUrl('notaurl')).toBe(false);
    expect(isValidHttpUrl('ftp://example.com/x')).toBe(false);
    expect(isValidHttpUrl('https://exa mple.com')).toBe(false);
    expect(isValidHttpUrl('https://user:pass@example.com/')).toBe(false);
  });
});
