import { isRecord, isStringArray } from '../lib/storage';

export type StepName = 'signed_up' | 'connected_data' | 'first_action';

/** Built-in records are synthetic; CSV imports are user-provided and unverified. */
export type FeedbackOrigin = 'synthetic' | 'user-provided';

export interface LabEvent {
  event_id: string;
  account_id: string;
  event_name: string;
  occurred_at: string; // ISO UTC
  /** Generator-built records are synthetic; CSV imports are user-provided. */
  origin: FeedbackOrigin;
}

export interface FeedbackRecord {
  feedback_id: string;
  account_id: string;
  text: string;
  received_at: string;
  origin: FeedbackOrigin;
}

/**
 * A theme's matching rule: plain keyword/phrase lists, case-insensitive
 * substring match. Shown literally in the UI so the rule is verifiable
 * against the data, not a black box.
 */
export interface ThemeRule {
  /** Phrases that indicate a record discusses this theme. */
  keywords: string[];
  /** Phrases that, found alongside a keyword match, flip a record from
   * supporting to conflicting (e.g. "flow was smooth" under a friction theme). */
  conflictKeywords: string[];
}

export interface Theme {
  id: string;
  title: string;
  notes: string;
  rule: ThemeRule;
  status: 'draft' | 'reviewed';
}

export interface Decision {
  problem: string;
  evidence: string;
  alternatives: string;
  scope: string;
  nonGoals: string;
  acceptance: string;
  metric: string;
  state: 'draft' | 'in-review' | 'approved';
  /** Stamp binding an approval to its contents + evidence snapshot. */
  approvalStamp?: string;
}

export const SNAPSHOT_ISO = '2025-04-15T00:00:00Z';
export const EARLIEST_SIGNUP_ISO = '2025-02-01T00:00:00Z';
export const ACTIVATION_WINDOW_DAYS = 7;

/* ---------- storage shape guards ---------- */

function isLabEvent(x: unknown): x is LabEvent {
  if (!isRecord(x)) return false;
  return (
    typeof x.event_id === 'string' &&
    typeof x.account_id === 'string' &&
    typeof x.event_name === 'string' &&
    typeof x.occurred_at === 'string' &&
    (x.origin === 'synthetic' || x.origin === 'user-provided')
  );
}

export function isLabEventArray(x: unknown): x is LabEvent[] {
  return Array.isArray(x) && x.every(isLabEvent);
}

function isFeedbackRecord(x: unknown): x is FeedbackRecord {
  if (!isRecord(x)) return false;
  return (
    typeof x.feedback_id === 'string' &&
    typeof x.account_id === 'string' &&
    typeof x.text === 'string' &&
    typeof x.received_at === 'string' &&
    (x.origin === 'synthetic' || x.origin === 'user-provided')
  );
}

export function isFeedbackArray(x: unknown): x is FeedbackRecord[] {
  return Array.isArray(x) && x.every(isFeedbackRecord);
}

function isThemeRule(x: unknown): x is ThemeRule {
  if (!isRecord(x)) return false;
  return isStringArray(x.keywords) && isStringArray(x.conflictKeywords);
}

function isTheme(x: unknown): x is Theme {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === 'string' &&
    typeof x.title === 'string' &&
    typeof x.notes === 'string' &&
    isThemeRule(x.rule) &&
    (x.status === 'draft' || x.status === 'reviewed')
  );
}

export function isThemeArray(x: unknown): x is Theme[] {
  return Array.isArray(x) && x.every(isTheme);
}

const DECISION_KEYS = ['problem', 'evidence', 'alternatives', 'scope', 'nonGoals', 'acceptance', 'metric'] as const;

export function isDecision(x: unknown): x is Decision {
  if (!isRecord(x)) return false;
  const stringsOk = DECISION_KEYS.every((k) => typeof x[k] === 'string');
  const stateOk = x.state === 'draft' || x.state === 'in-review' || x.state === 'approved';
  const stampOk = x.approvalStamp === undefined || typeof x.approvalStamp === 'string';
  return stringsOk && stateOk && stampOk;
}
