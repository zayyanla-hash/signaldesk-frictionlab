import { describe, expect, it } from 'vitest';
import { classifyFeedback, editTheme, feedbackJoinWarnings, matchThemeFeedback, textMatchesRule } from './evidence';
import type { FeedbackRecord, LabEvent, Theme } from './types';

const THEME: Theme = {
  id: 't1',
  title: 'T',
  notes: 'N',
  rule: { keywords: ['source', 'option'], conflictKeywords: ['no issues'] },
  status: 'reviewed',
};
const F1: FeedbackRecord = { feedback_id: 'f1', account_id: 'a1', text: 'hi', received_at: '2025-03-05T12:00:00Z', origin: 'synthetic' as const };

describe('theme edits', () => {
  it('returns a reviewed theme to draft on content edits', () => {
    expect(editTheme(THEME, { title: 'New' }).invalidated).toBe(true);
    expect(editTheme(THEME, { title: 'New' }).theme.status).toBe('draft');
    expect(editTheme(THEME, { rule: { keywords: ['x'], conflictKeywords: [] } }).invalidated).toBe(true);
    expect(editTheme({ ...THEME, status: 'draft' }, { title: 'New' }).invalidated).toBe(false);
  });
});

describe('textMatchesRule', () => {
  it('matches case-insensitively as a substring', () => {
    expect(textMatchesRule('The Data Source was unclear', ['data source'])).toBe(true);
    expect(textMatchesRule('nothing relevant here', ['data source'])).toBe(false);
  });
  it('ignores blank phrases', () => {
    expect(textMatchesRule('anything', ['', '  '])).toBe(false);
  });
});

describe('matchThemeFeedback', () => {
  const theme: Theme = {
    id: 't-source',
    title: 'Confusing data-source choice',
    notes: '',
    rule: { keywords: ['data source', 'source', 'option'], conflictKeywords: ['source was clear', 'easy to choose'] },
    status: 'draft',
  };
  const records: FeedbackRecord[] = [
    { feedback_id: 'f1', account_id: 'a1', text: 'Could not figure out which data source to use. The options are overwhelming.', received_at: '2025-03-04T14:00:00Z', origin: 'synthetic' },
    { feedback_id: 'f2', account_id: 'a2', text: 'Got an error during setup and was not sure what to do next.', received_at: '2025-03-06T09:30:00Z', origin: 'synthetic' },
    { feedback_id: 'f3', account_id: 'a1', text: 'The source was clear this time, easy to choose.', received_at: '2025-03-07T09:30:00Z', origin: 'synthetic' },
  ];

  it('applies the rule to every record, not a hand-picked subset', () => {
    const m = matchThemeFeedback(theme, records);
    expect(m.supporting.map((f) => f.feedback_id)).toEqual(['f1']);
    expect(m.conflicting.map((f) => f.feedback_id)).toEqual(['f3']);
    // f2 matches neither keywords nor conflicts, so it is absent from both buckets.
  });

  it('counts distinct accounts from supporting records only', () => {
    const m = matchThemeFeedback(theme, records);
    expect(m.uniqueAccounts).toBe(1);
  });

  it('excludes conflicting records from the support count instead of silently dropping them', () => {
    const m = matchThemeFeedback(theme, records);
    expect(m.supporting.find((f) => f.feedback_id === 'f3')).toBeUndefined();
    expect(m.conflicting).toHaveLength(1);
  });
});

describe('classifyFeedback', () => {
  const themes: Theme[] = [
    { id: 't1', title: 'Confusing data-source choice', notes: '', rule: { keywords: ['source', 'option'], conflictKeywords: ['source was clear'] }, status: 'draft' },
    { id: 't2', title: 'Setup errors without guidance', notes: '', rule: { keywords: ['error', 'setup'], conflictKeywords: ['setup was smooth'] }, status: 'draft' },
  ];

  it('labels a record with the first theme it supports', () => {
    const f: FeedbackRecord = { feedback_id: 'f1', account_id: 'a1', text: 'Got an error during setup.', received_at: '2025-03-06T09:30:00Z', origin: 'synthetic' };
    expect(classifyFeedback(f, themes)).toMatchObject({ label: 'Setup errors without guidance', status: 'support' });
  });

  it('labels a conflicting record distinctly, never as support', () => {
    const f: FeedbackRecord = { feedback_id: 'f2', account_id: 'a2', text: 'The setup was smooth, no complaints.', received_at: '2025-03-06T09:30:00Z', origin: 'synthetic' };
    const result = classifyFeedback(f, themes);
    expect(result.status).toBe('conflict');
    expect(result.label).toMatch(/Setup errors without guidance/);
  });

  it('labels unrelated records as having no linked theme', () => {
    const f: FeedbackRecord = { feedback_id: 'f3', account_id: 'a3', text: 'We need SSO before we can proceed.', received_at: '2025-03-06T09:30:00Z', origin: 'synthetic' };
    expect(classifyFeedback(f, themes)).toMatchObject({ label: 'no linked theme', status: 'none' });
  });
});

describe('feedback join warnings', () => {
  const events: LabEvent[] = [
    { event_id: 'e1', account_id: 'a1', event_name: 'signed_up', occurred_at: '2025-03-01T10:00:00Z', origin: 'synthetic' },
  ];
  it('flags pre-signup feedback as a weak join', () => {
    const w = feedbackJoinWarnings(
      [{ ...F1, received_at: '2025-02-20T10:00:00Z' }],
      events
    );
    expect(w).toHaveLength(1);
    expect(w[0].warning).toMatch(/before.*signed up|weak join/i);
  });

  it('flags feedback for accounts with events but no valid signup', () => {
    const w = feedbackJoinWarnings(
      [{ ...F1, account_id: 'a2' }],
      [{ event_id: 'e9', account_id: 'a2', event_name: 'connected_data', occurred_at: '2025-03-02T10:00:00Z', origin: 'synthetic' }]
    );
    expect(w).toHaveLength(1);
    expect(w[0].warning).toMatch(/no valid signup|weak join/i);
  });

  it('flags feedback for accounts with no events at all', () => {
    const w = feedbackJoinWarnings([{ ...F1, account_id: 'ghost' }], events);
    expect(w).toHaveLength(1);
    expect(w[0].warning).toMatch(/No events/);
  });

  it('stays silent for well-joined records', () => {
    expect(feedbackJoinWarnings([F1], events)).toEqual([]);
  });
});
