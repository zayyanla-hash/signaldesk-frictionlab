import { describe, expect, it } from 'vitest';
import { migrateAccounts } from './migration';
import { isAccount } from './types';

describe('account migration', () => {
  it('clamps out-of-range scores and coerces unsafe URLs with notes', () => {
    const { accounts, notes } = migrateAccounts([
      {
        id: 'a',
        company: 'A',
        domain: 'a.example',
        employees: '1-10',
        industry: 'Software',
        headquarters: 'X',
        scores: { fit: 150, intent: -20, engagement: NaN, timing: 50 },
        evidenceQuality: 'high',
        exclusionReason: null,
        signals: [
          {
            id: 's1',
            kind: 'fact',
            label: 'L',
            detail: 'D',
            sourceNote: '',
            provenance: { origin: 'user-import', sourceUrl: 'javascript:alert(1)', publicationDate: null, retrievalDate: null },
          },
        ],
        reviewState: 'approved',
      },
    ]);
    expect(accounts).toHaveLength(1);
    expect(isAccount(accounts[0])).toBe(true);
    expect(accounts[0].scores).toEqual({ fit: 100, intent: 0, engagement: 0, timing: 50 });
    expect(accounts[0].signals[0].provenance.sourceUrl).toBeNull();
    expect(notes.join(' ')).toMatch(/Clamped|unsafe/i);
  });

  it('drops empty and duplicate IDs and keeps the first copy', () => {
    const base = {
      company: 'A',
      domain: 'a.example',
      employees: '1-10',
      industry: 'Software',
      headquarters: 'X',
      scores: { fit: 10, intent: 10, engagement: 10, timing: 10 },
      evidenceQuality: 'low' as const,
      exclusionReason: null,
      signals: [],
      reviewState: 'unreviewed' as const,
    };
    const { accounts, dropped } = migrateAccounts([
      { ...base, id: '' },
      { ...base, id: 'x' },
      { ...base, id: 'x' },
      { ...base, id: 'y' },
    ]);
    expect(accounts.map((a) => a.id)).toEqual(['x', 'y']);
    expect(dropped).toBe(2);
  });

  it('rejects non-arrays and empty input', () => {
    expect(migrateAccounts(null).accounts).toEqual([]);
    expect(migrateAccounts([]).accounts).toEqual([]);
    expect(migrateAccounts({}).accounts).toEqual([]);
  });

  it('turns impossible stored source dates into unknown', () => {
    const { accounts, notes } = migrateAccounts([
      {
        id: 'd',
        company: 'D',
        domain: 'd.example',
        employees: '1-10',
        industry: 'Software',
        headquarters: 'H',
        scores: { fit: 10, intent: 10, engagement: 10, timing: 10 },
        evidenceQuality: 'medium',
        exclusionReason: null,
        signals: [
          { id: 's', kind: 'fact', label: 'L', detail: 'D', sourceNote: '', provenance: { origin: 'user-import', sourceUrl: 'https://d.example/x', publicationDate: '2025-02-30', retrievalDate: '2025-13-99' } },
        ],
        reviewState: 'in-review',
      },
    ]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].signals[0].provenance.publicationDate).toBeNull();
    expect(accounts[0].signals[0].provenance.retrievalDate).toBeNull();
    expect(notes.join(' ')).toMatch(/unsafe|coerc/i);
  });

  it('returns legacy approvals to in-review even without other repairs', () => {
    const clean = {
      company: 'L',
      domain: 'l.example',
      employees: '1-10',
      industry: 'Software',
      headquarters: 'H',
      scores: { fit: 10, intent: 10, engagement: 10, timing: 10 },
      evidenceQuality: 'high' as const,
      exclusionReason: null,
      signals: [],
      reviewState: 'approved' as const,
    };
    const { accounts } = migrateAccounts([{ ...clean, id: 'legacy-1' }]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].reviewState).toBe('in-review');
  });

  it('discards stored approval when scores are materially repaired', () => {
    const base = {
      id: 'x',
      company: 'X',
      domain: 'x.example',
      employees: '1-10',
      industry: 'Software',
      headquarters: 'H',
      scores: { fit: 999, intent: 10, engagement: 10, timing: 10 },
      evidenceQuality: 'high' as const,
      exclusionReason: null,
      signals: [],
      reviewState: 'approved' as const,
    };
    const { accounts, notes } = migrateAccounts([base]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].scores.fit).toBe(100);
    expect(accounts[0].reviewState).toBe('in-review');
    expect(notes.join(' ')).toMatch(/approval.*in-review|in-review/i);
  });

  it('discards stored approval when an unsafe source URL is repaired', () => {
    const { accounts } = migrateAccounts([
      {
        id: 'u',
        company: 'U',
        domain: 'u.example',
        employees: '1-10',
        industry: 'Software',
        headquarters: 'H',
        scores: { fit: 10, intent: 10, engagement: 10, timing: 10 },
        evidenceQuality: 'high' as const,
        exclusionReason: null,
        signals: [
          { id: 's', kind: 'fact', label: 'L', detail: 'D', sourceNote: '', provenance: { origin: 'user-import', sourceUrl: 'javascript:alert(1)', publicationDate: null, retrievalDate: null } },
        ],
        reviewState: 'approved' as const,
      },
    ]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].signals[0].provenance.sourceUrl).toBeNull();
    expect(accounts[0].reviewState).toBe('in-review');
  });

  it('infers imported provenance instead of relabeling it synthetic', () => {
    const { accounts } = migrateAccounts([
      {
        id: 'csv-2025-01-01-abc-0',
        company: 'C',
        domain: 'c.example',
        employees: 'Unknown',
        industry: 'Unknown',
        headquarters: 'Unknown',
        scores: { fit: 10, intent: 10, engagement: 10, timing: 10 },
        evidenceQuality: 'low' as const,
        exclusionReason: null,
        signals: [
          { id: 's', kind: 'fact', label: 'L', detail: 'D', sourceNote: '', provenance: { origin: 'mystery', sourceUrl: null, publicationDate: null, retrievalDate: null } },
        ],
        reviewState: 'in-review' as const,
      },
    ]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].dataset).toBe('imported');
    expect(accounts[0].signals[0].provenance.origin).toBe('user-import');
  });
});
