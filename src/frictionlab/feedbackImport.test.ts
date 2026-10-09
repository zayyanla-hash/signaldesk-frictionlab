import { describe, expect, it } from 'vitest';
import { validateFeedbackCSV } from './feedbackImport';

const HEADER = 'feedback_id,account_id,text,received_at';
const KNOWN = new Set(['acct-001', 'acct-002']);

describe('feedback.csv import', () => {
  it('accepts valid rows as user-provided, unverified records', () => {
    const r = validateFeedbackCSV(`${HEADER}\nf1,acct-001,The picker confused me.,2025-03-05T12:00:00Z`, {
      knownAccountIds: KNOWN,
    });
    expect(r.records).toHaveLength(1);
    expect(r.records[0].origin).toBe('user-provided');
    expect(r.records[0].received_at).toBe('2025-03-05T12:00:00.000Z');
    expect(r.quarantined).toHaveLength(0);
  });

  it('quarantines duplicates, bad timezones, futures, unjoinable accounts, and empty rows', () => {
    const csv = [
      HEADER,
      'f1,acct-001,First.,2025-03-05T12:00:00Z',
      '',
      'f1,acct-001,Duplicate id.,2025-03-06T12:00:00Z',
      'f2,acct-001,No timezone.,2025-03-06 12:00:00',
      'f3,acct-001,Future.,2025-05-01T12:00:00Z',
      'f4,acct-999,Unknown account.,2025-03-06T12:00:00Z',
      'fbad,,,',
    ].join('\n');
    const r = validateFeedbackCSV(csv, { knownAccountIds: KNOWN });
    expect(r.records).toHaveLength(1);
    expect(r.quarantined).toHaveLength(5);
    const reasons = r.quarantined.map((q) => q.reason).join(' | ');
    expect(reasons).toMatch(/Duplicate/);
    expect(reasons).toMatch(/timezone/i);
    expect(reasons).toMatch(/future/i);
    expect(reasons).toMatch(/Unjoinable/);
    expect(reasons).toMatch(/Missing required field/);
    expect(r.skippedEmpty).toBe(1);
  });

  it('does not let an invalid row reserve an ID against a later valid row', () => {
    const csv = [
      HEADER,
      'f1,acct-001,Bad date row.,not-a-date',
      'f1,acct-001,Valid later row.,2025-03-06T12:00:00Z',
    ].join('\n');
    const r = validateFeedbackCSV(csv, { knownAccountIds: KNOWN });
    expect(r.records).toHaveLength(1);
    expect(r.records[0].text).toBe('Valid later row.');
    expect(r.quarantined).toHaveLength(1);
  });

  it('reports physical row numbers for multiline fields', () => {
    const csv = `${HEADER}\nf1,acct-001,"line one\nline two",2025-03-06T12:00:00Z\nbad-row`;
    const r = validateFeedbackCSV(csv, { knownAccountIds: KNOWN });
    expect(r.records).toHaveLength(1);
    expect(r.records[0].text).toBe('line one\nline two');
    // The malformed single-column record starts at physical row 4.
    expect(r.parseErrors.join(' ')).toMatch(/row 4/);
  });

  it('detects conflicts with already-imported IDs', () => {
    const r = validateFeedbackCSV(`${HEADER}\nf1,acct-001,Again.,2025-03-06T12:00:00Z`, {
      knownAccountIds: KNOWN,
      existingIds: new Set(['f1']),
    });
    expect(r.records).toHaveLength(0);
    expect(r.quarantined[0].reason).toMatch(/conflicts with an existing record/);
  });

  it('rejects a wrong header with a readable error', () => {
    const r = validateFeedbackCSV('foo,bar\n1,2', { knownAccountIds: KNOWN });
    expect(r.records).toHaveLength(0);
    expect(r.parseErrors.join(' ')).toMatch(/Header missing/);
  });
});
