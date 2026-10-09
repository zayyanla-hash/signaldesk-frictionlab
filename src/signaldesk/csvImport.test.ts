import { describe, expect, it } from 'vitest';
import { validateSignalCSV } from './csvImport';

const VALID = `company,domain,source_url,source_date,evidence_text,tags
Acme Test,acme-test.example,,2025-03-01,Sample row,fit:70;intent:60;engagement:50;timing:40`;

describe('signaldesk csv import', () => {
  it('accepts a valid row and flags it for review', () => {
    const r = validateSignalCSV(VALID);
    expect(r.imported).toHaveLength(1);
    expect(r.imported[0].reviewState).toBe('in-review');
    expect(r.quarantined).toHaveLength(0);
  });

  it('quarantines bad domains, bad urls, bad dates, and bad tags (failure state)', () => {
    const bad = `company,domain,source_url,source_date,evidence_text,tags
Bad Co,not a domain,notaurl,03/01/2025,hi,fit:high`;
    const r = validateSignalCSV(bad);
    expect(r.imported).toHaveLength(0);
    expect(r.quarantined.length).toBeGreaterThan(0);
  });

  it('rejects a wrong header with a readable error', () => {
    const r = validateSignalCSV('foo,bar\n1,2');
    expect(r.imported).toHaveLength(0);
    expect(r.parseErrors.join(' ')).toMatch(/Header missing/);
  });

  it('quarantines a positive score tag with no evidence text', () => {
    const csv = `company,domain,source_url,source_date,evidence_text,tags
No Evidence Co,no-evidence.example,,,,fit:80`;
    const r = validateSignalCSV(csv);
    expect(r.imported).toHaveLength(0);
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0].reason).toMatch(/require evidence_text/);
  });

  it('quarantines a formula-like company or evidence cell', () => {
    const csv = `company,domain,source_url,source_date,evidence_text,tags
=cmd|'/c calc'!A1,formula.example,,,Some evidence,`;
    const r = validateSignalCSV(csv);
    expect(r.imported).toHaveLength(0);
    expect(r.quarantined[0].reason).toMatch(/formula trigger/);
  });

  it('quarantines a duplicate company+domain within the same file', () => {
    const csv = `company,domain,source_url,source_date,evidence_text,tags
Dup Co,dup.example,,,First mention.,
Dup Co,dup.example,,,Second mention.,`;
    const r = validateSignalCSV(csv);
    expect(r.imported).toHaveLength(1);
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0].reason).toMatch(/Duplicate of row/);
  });
});
