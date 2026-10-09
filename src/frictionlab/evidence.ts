import type { FeedbackRecord, LabEvent, Theme } from './types';

export interface EditedTheme {
  theme: Theme;
  /** True when a reviewed theme was returned to draft by this edit. */
  invalidated: boolean;
}

/**
 * Apply a theme edit. Changes to title, notes, or the matching rule change
 * what the review covered, so a reviewed theme returns to draft with visibility.
 */
export function editTheme(theme: Theme, patch: Partial<Theme>): EditedTheme {
  const next: Theme = { ...theme, ...patch };
  const touchesContent =
    patch.title !== undefined || patch.notes !== undefined || patch.rule !== undefined;
  if (touchesContent && theme.status === 'reviewed') {
    return { theme: { ...next, status: 'draft' }, invalidated: true };
  }
  return { theme: next, invalidated: false };
}

/** Case-insensitive substring match against a list of keyword/phrases. */
export function textMatchesRule(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some((p) => p.trim().length > 0 && lower.includes(p.trim().toLowerCase()));
}

export interface ThemeMatch {
  /** Records whose text matches the theme's keywords, with no contradicting language. */
  supporting: FeedbackRecord[];
  /** Records that match a keyword AND a conflict phrase: kept visible, never counted as support. */
  conflicting: FeedbackRecord[];
  uniqueAccounts: number;
}

/**
 * Apply a theme's transparent keyword rule to every feedback record (not a
 * hand-picked subset). A record that matches a theme's keywords but also
 * contains language contradicting the theme is excluded from support and
 * reported as conflicting instead of being silently dropped.
 */
export function matchThemeFeedback(theme: Theme, feedback: FeedbackRecord[]): ThemeMatch {
  const supporting: FeedbackRecord[] = [];
  const conflicting: FeedbackRecord[] = [];
  feedback.forEach((f) => {
    if (!textMatchesRule(f.text, theme.rule.keywords)) return;
    if (textMatchesRule(f.text, theme.rule.conflictKeywords)) {
      conflicting.push(f);
    } else {
      supporting.push(f);
    }
  });
  return { supporting, conflicting, uniqueAccounts: new Set(supporting.map((f) => f.account_id)).size };
}

export interface FeedbackClassification {
  label: string;
  status: 'support' | 'conflict' | 'none';
  themeId?: string;
}

/**
 * Classify one feedback record against every theme's rule, for display in a
 * one-row-per-record ledger. Support wins over conflict across different
 * themes; within a theme, conflicting language always excludes support.
 */
export function classifyFeedback(f: FeedbackRecord, themes: Theme[]): FeedbackClassification {
  for (const t of themes) {
    if (matchThemeFeedback(t, [f]).supporting.length > 0) {
      return { label: t.title, status: 'support', themeId: t.id };
    }
  }
  for (const t of themes) {
    if (matchThemeFeedback(t, [f]).conflicting.length > 0) {
      return { label: `Conflicts with "${t.title}"`, status: 'conflict', themeId: t.id };
    }
  }
  return { label: 'no linked theme', status: 'none' };
}

export interface JoinWarning {
  feedback_id: string;
  account_id: string;
  warning: string;
}

/**
 * Flag joins that do not prove causation: feedback received before the
 * account's earliest signup, or feedback for accounts with no events at all.
 * Displayed as weak-evidence warnings wherever the record appears. This is
 * independent of theme keyword matching: a record can match a theme's rule
 * cleanly and still carry a weak join warning, and that warning is never
 * upgraded to a stronger join than actually exists.
 */
export function feedbackJoinWarnings(feedback: FeedbackRecord[], events: LabEvent[]): JoinWarning[] {
  const signups = new Map<string, number>();
  const hasEvents = new Set<string>();
  events.forEach((e) => {
    hasEvents.add(e.account_id);
    if (e.event_name === 'signed_up') {
      const ms = Date.parse(e.occurred_at);
      const prev = signups.get(e.account_id);
      if (!Number.isNaN(ms) && (prev === undefined || ms < prev)) signups.set(e.account_id, ms);
    }
  });
  const out: JoinWarning[] = [];
  feedback.forEach((f) => {
    const signup = signups.get(f.account_id);
    const received = Date.parse(f.received_at);
    if (Number.isNaN(received)) return;
    if (signup === undefined) {
      // No valid signup: weak join whether or not stray events exist.
      out.push({
        feedback_id: f.feedback_id,
        account_id: f.account_id,
        warning: hasEvents.has(f.account_id)
          ? 'This account has events but no valid signup: weak join, treat as context only.'
          : 'No events exist for this account, so the feedback cannot be joined to funnel evidence.',
      });
      return;
    }
    if (received < signup) {
      out.push({
        feedback_id: f.feedback_id,
        account_id: f.account_id,
        warning: 'Received before this account signed up: weak join, treat as context only.',
      });
    }
  });
  return out;
}
