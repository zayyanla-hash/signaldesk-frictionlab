import { describe, expect, it } from 'vitest';
import { computeFunnel } from './analytics';
import { handFixture } from './generator';

describe('frictionlab funnel contract', () => {
  it('matches the hand-checkable fixture', () => {
    const { events, snapshot } = handFixture();
    const f = computeFunnel(events, snapshot);
    // Eligible: A, B, D, E, G (C incomplete, F unjoinable)
    expect(f.eligible).toBe(5);
    expect(f.incomplete).toBe(1);
    // A full, G connected ignored (future), D action ignored (out of order), E dup ignored
    expect(f.stepCounts).toEqual({ signed_up: 5, connected_data: 1, first_action: 1 });
    expect(f.ttvDenominator).toBe(1);
    expect(f.medianTTVHours).toBeCloseTo(48, 0);
  });

  it('handles duplicates, missing signup, out-of-order and future events via quarantine', () => {
    const { events, snapshot } = handFixture();
    const f = computeFunnel(events, snapshot);
    const reasons = f.quarantined.map((q) => q.reason).join(' | ');
    expect(reasons).toMatch(/Duplicate/);
    expect(reasons).toMatch(/unjoinable/i);
    expect(reasons).toMatch(/after snapshot/);
  });

  it('handles timezones: equivalent offsets give identical results', () => {
    const base = [
      { event_id: 't1', account_id: 'Z', event_name: 'signed_up', occurred_at: '2025-03-01T10:00:00Z', origin: 'synthetic' as const },
      { event_id: 't2', account_id: 'Z', event_name: 'connected_data', occurred_at: '2025-03-02T10:00:00Z', origin: 'synthetic' as const },
      { event_id: 't3', account_id: 'Z', event_name: 'first_action', occurred_at: '2025-03-03T10:00:00Z', origin: 'synthetic' as const },
    ];
    const shifted = base.map((e, i) => ({ ...e, event_id: `s${i}`, occurred_at: e.occurred_at.replace('10:00:00Z', '12:00:00+02:00') }));
    const a = computeFunnel(base, '2025-03-10T00:00:00Z');
    const b = computeFunnel(shifted, '2025-03-10T00:00:00Z');
    expect(a.stepCounts).toEqual(b.stepCounts);
  });

  it('returns zeros for empty cohorts (failure state safe)', () => {
    const f = computeFunnel([], '2025-03-10T00:00:00Z');
    expect(f.eligible).toBe(0);
    expect(f.stepCounts.first_action).toBe(0);
    expect(f.medianTTVHours).toBeNull();
    expect(f.ttvDenominator).toBe(0);
  });
});
