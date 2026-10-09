import { describe, expect, it } from 'vitest';
import { resolveStoredAccounts } from './SignalDeskApp';
import { getResearchedAccounts } from './researched';
import { DEFAULT_CRITERIA, SAMPLE_ACCOUNTS } from './sampleData';
import { isAccountArray, isICPCriteria } from './types';

const valid = getResearchedAccounts().slice(0, 1);

describe('saved-state guards (audit reproductions)', () => {
  it('rejects negative criteria and contradictory headcount ranges', () => {
    expect(isICPCriteria({ ...DEFAULT_CRITERIA, minEmployees: -5 })).toBe(false);
    expect(isICPCriteria({ ...DEFAULT_CRITERIA, minEmployees: 500, maxEmployees: 50 })).toBe(false);
    expect(isICPCriteria({ ...DEFAULT_CRITERIA, maxEmployees: NaN })).toBe(false);
    expect(isICPCriteria(DEFAULT_CRITERIA)).toBe(true);
  });

  it('rejects out-of-range scores and duplicate account IDs', () => {
    const bad = { ...SAMPLE_ACCOUNTS[0], scores: { fit: 999, intent: 0, engagement: 0, timing: 0 } };
    expect(isAccountArray([bad])).toBe(false);
    expect(isAccountArray([SAMPLE_ACCOUNTS[0], SAMPLE_ACCOUNTS[0]])).toBe(false);
    expect(isAccountArray([SAMPLE_ACCOUNTS[0], { ...SAMPLE_ACCOUNTS[1] }])).toBe(true);
  });

  it('refuses impossible stored source dates', () => {
    const badPub = {
      ...SAMPLE_ACCOUNTS[0],
      signals: [
        { id: 's', kind: 'fact' as const, label: 'L', detail: 'D', sourceNote: '', provenance: { origin: 'synthetic-sample' as const, sourceUrl: null, publicationDate: '2025-02-30', retrievalDate: null } },
      ],
    };
    expect(isAccountArray([badPub])).toBe(false);
    const badRet = {
      ...SAMPLE_ACCOUNTS[0],
      signals: [
        { id: 's', kind: 'fact' as const, label: 'L', detail: 'D', sourceNote: '', provenance: { origin: 'synthetic-sample' as const, sourceUrl: null, publicationDate: null, retrievalDate: '2025-13-99' } },
      ],
    };
    expect(isAccountArray([badRet])).toBe(false);
  });

  it('refuses unknown storage versions without migrating them', () => {
    const r = resolveStoredAccounts(JSON.stringify({ v: 99, data: valid }));
    expect(r.value).toHaveLength(12);
    expect(r.value[0].id.startsWith('res-')).toBe(true);
    expect(r.notice).toMatch(/unknown storage version/i);
  });

  it('migrates only the known legacy array schema, with notes', () => {
    const legacy = [{ ...SAMPLE_ACCOUNTS[1], scores: { fit: 999, intent: 0, engagement: 0, timing: 0 }, reviewState: 'approved' }];
    delete (legacy[0] as Record<string, unknown>).dataset;
    const r = resolveStoredAccounts(JSON.stringify(legacy));
    expect(r.value).toHaveLength(1);
    expect(r.value[0].scores.fit).toBe(100);
    expect(r.value[0].reviewState).toBe('in-review');
    expect(r.notice).toMatch(/Recovered|legacy/i);
  });

  it('recovers safely from malformed optional arrays and source dates', () => {
    const broken = {
      ...SAMPLE_ACCOUNTS[2],
      unknowns: 'not-an-array',
      scores: { fit: 10, intent: 10, engagement: 10, timing: 10 },
      signals: [
        { id: 's', kind: 'fact', label: 'L', detail: 'D', sourceNote: '', provenance: { origin: 'user-import', sourceUrl: 'https://a.example/x', publicationDate: 'not-a-date', retrievalDate: '2025-13-99' } },
      ],
    };
    const r = resolveStoredAccounts(JSON.stringify([broken]));
    expect(r.value).toHaveLength(1);
    expect(r.value[0].unknowns).toBeUndefined();
    expect(r.value[0].signals[0].provenance.publicationDate).toBeNull();
  });
});
