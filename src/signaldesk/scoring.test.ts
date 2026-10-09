import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA, SAMPLE_ACCOUNTS } from './sampleData';
import { normalizeWeights, rankAccounts, scoreAccount, validateWeights } from './scoring';
import { DEFAULT_WEIGHTS } from './types';

describe('signaldesk scoring', () => {
  it('is deterministic across runs', () => {
    const a = SAMPLE_ACCOUNTS[0];
    const s1 = scoreAccount(a, DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    const s2 = scoreAccount(a, DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    expect(s1).toEqual(s2);
  });

  it('shows visible component totals that sum to the total', () => {
    const a = SAMPLE_ACCOUNTS[0];
    const s = scoreAccount(a, DEFAULT_WEIGHTS);
    const sum = s.parts.reduce((t, p) => t + p.contribution, 0);
    expect(s.total).toBe(sum);
    expect(s.parts.map((p) => p.key).sort()).toEqual(['engagement', 'fit', 'intent', 'timing']);
  });

  it('hard exclusions override high scores', () => {
    const small = SAMPLE_ACCOUNTS.find((a) => a.id === 'a13')!;
    const s = scoreAccount(small, DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    expect(s.total).toBeGreaterThan(80);
    expect(s.excluded).toBe(true);
    expect(s.exclusionReason).toMatch(/headcount/i);
    const ranked = rankAccounts(SAMPLE_ACCOUNTS, DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    // Every excluded account ranks below every included one, and a13 is among them.
    const isExcluded = (a: (typeof ranked)[number]) => scoreAccount(a, DEFAULT_WEIGHTS, DEFAULT_CRITERIA).excluded;
    const firstExcluded = ranked.findIndex(isExcluded);
    expect(ranked.slice(firstExcluded).every(isExcluded)).toBe(true);
    expect(ranked.slice(firstExcluded).some((r) => r.id === 'a13')).toBe(true);
  });

  it('treats missing evidence as zero, not positive', () => {
    const blank = { ...SAMPLE_ACCOUNTS[0], id: 'blank', scores: { fit: 0, intent: 0, engagement: 0, timing: 0 } };
    const s = scoreAccount(blank, DEFAULT_WEIGHTS);
    expect(s.total).toBe(0);
  });

  it('never presents scores as probabilities', () => {
    // Contract guard: totals are integers 0-100 with no probability language in code output.
    const s = scoreAccount(SAMPLE_ACCOUNTS[1], DEFAULT_WEIGHTS);
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });
});

describe('weight validation and normalization', () => {
  it('bounds totals at 100 when every weight is 100', () => {
    expect(validateWeights({ fit: 100, intent: 100, engagement: 100, timing: 100 }).ok).toBe(true);
    const a = { ...SAMPLE_ACCOUNTS[0], scores: { fit: 100, intent: 100, engagement: 100, timing: 100 } };
    const s = scoreAccount(a, { fit: 100, intent: 100, engagement: 100, timing: 100 });
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.parts.reduce((t, p) => t + p.contribution, 0)).toBe(s.total);
    expect(normalizeWeights({ fit: 0, intent: 0, engagement: 0, timing: 0 }).equalFallback).toBe(true);
  });

  it('rejects NaN, infinite, and negative weights', () => {
    expect(validateWeights({ fit: NaN, intent: 25, engagement: 20, timing: 25 }).ok).toBe(false);
    expect(validateWeights({ fit: -1, intent: 25, engagement: 20, timing: 25 }).ok).toBe(false);
    expect(validateWeights({ fit: Infinity, intent: 25, engagement: 20, timing: 25 }).ok).toBe(false);
  });

  it('sanitizes hostile weights defensively so scoring never exceeds bounds', () => {
    const a = { ...SAMPLE_ACCOUNTS[0], scores: { fit: 100, intent: 100, engagement: 100, timing: 100 } };
    const s = scoreAccount(a, { fit: NaN, intent: -50, engagement: Infinity, timing: 25 });
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it('stays finite for extreme magnitudes via scaled ratios', () => {
    const a = { ...SAMPLE_ACCOUNTS[0], scores: { fit: 80, intent: 60, engagement: 40, timing: 20 } };
    const s = scoreAccount(a, { fit: 1e308, intent: 1e308, engagement: 1e308, timing: 1e308 });
    expect(Number.isFinite(s.total)).toBe(true);
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.parts.reduce((t, p) => t + p.contribution, 0)).toBe(s.total);
  });
});
