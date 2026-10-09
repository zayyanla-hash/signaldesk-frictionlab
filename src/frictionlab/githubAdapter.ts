import type { Decision, FeedbackOrigin, FeedbackRecord, LabEvent, Theme } from './types';

export interface IssuePayload {
  title: string;
  body: string;
  labels: string[];
}

/** Fields whose edits change the meaning of an approval. */
export const DECISION_CONTENT_KEYS = [
  'problem',
  'evidence',
  'alternatives',
  'scope',
  'nonGoals',
  'acceptance',
  'metric',
] as const;

export type DecisionContentKey = (typeof DECISION_CONTENT_KEYS)[number];

export interface AppliedEdit {
  decision: Decision;
  /** True when an approved decision was returned to draft by this edit. */
  invalidated: boolean;
}

/**
 * Apply an edit to a decision. Any change to a content field (including the
 * selected problem) invalidates a prior approval: the contents no longer
 * match what was approved, so the state returns to draft.
 */
export function applyDecisionEdit(decision: Decision, patch: Partial<Decision>): AppliedEdit {
  const next: Decision = { ...decision, ...patch };
  const touchesContent = (Object.keys(patch) as (keyof Decision)[]).some((k) =>
    (DECISION_CONTENT_KEYS as readonly string[]).includes(k)
  );
  if (touchesContent && decision.state === 'approved') {
    return { decision: { ...next, state: 'draft' }, invalidated: true };
  }
  return { decision: next, invalidated: false };
}

/** Canonical handoff preamble: title line, blank, then exactly one State line. */
export const HANDOFF_PREAMBLE_LINES = 8;

/**
 * Validate approved handoff metadata against the canonical exported structure:
 * line 1 is `# Issue: <non-empty title>`, line 3 is the single approved State
 * line, exactly one State line in the first HANDOFF_PREAMBLE_LINES lines, and
 * no State lines elsewhere. Mirrors the CLI validator.
 */
export function validateHandoffApproval(markdown: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return { ok: false, errors: ['Handoff Markdown is empty.'] };
  }
  const trimmed = markdown.split('\n').map((l) => l.trim());
  if (!/^# Issue:\s*\S/.test(trimmed[0] ?? '')) {
    errors.push('Handoff is missing its canonical `# Issue:` heading on line 1. Re-export from an approved decision.');
  }
  const inPreamble = trimmed.slice(0, HANDOFF_PREAMBLE_LINES).filter((l) => /^state\s*:/i.test(l));
  const everywhere = trimmed.filter((l) => /^state\s*:/i.test(l));
  if (!/^state\s*:\s*approved\s*$/i.test(trimmed[2] ?? '')) {
    errors.push('Handoff line 3 is not the approved-state marker. Approve the decision before export.');
  }
  if (inPreamble.length > 1) {
    errors.push('Handoff carries more than one State line in its preamble. Metadata is ambiguous.');
  }
  if (everywhere.length > inPreamble.length) {
    errors.push('Handoff carries State lines outside its preamble. Metadata is ambiguous.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Truncate at the nearest word boundary with an ellipsis, instead of cutting
 * mid-word. Returns a string no longer than `max`.
 */
export function truncateTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/** Build a GitHub issue payload from a single decision (one problem, one body). */
export function buildIssuePayload(d: Decision, origins: FeedbackOrigin[] = ['synthetic']): IssuePayload {
  const title = truncateTitle(`Onboarding friction: ${d.problem}`, 120);
  const body = [
    `## Problem`,
    d.problem,
    ``,
    `## Supporting evidence`,
    d.evidence,
    ``,
    `## Alternatives considered`,
    d.alternatives,
    ``,
    `## Scope`,
    d.scope,
    ``,
    `## Non-goals`,
    d.nonGoals,
    ``,
    `## Acceptance criteria`,
    d.acceptance,
    ``,
    `## Success metric`,
    d.metric,
    ``,
    `_${provenanceFooter(origins)}_`,
  ].join('\n');
  return { title, body, labels: ['frictionlab', 'onboarding'] };
}
/** Honest evidence provenance for payloads and exports. */
export function provenanceFooter(origins: FeedbackOrigin[]): string {
  const parts: string[] = [];
  if (origins.includes('synthetic')) parts.push('synthetic sample records');
  if (origins.includes('user-provided')) parts.push('user-provided records (unverified)');
  const evidence = parts.length > 0 ? parts.join(' and ') : 'synthetic sample records';
  return `Exported from FrictionLab. Evidence: ${evidence}.`;
}

/**
 * Declare every origin present across feedback AND events. Event-only imports
 * must appear in the handoff provenance; user input is never called synthetic.
 */
export function evidenceOrigins(feedback: FeedbackRecord[], events: LabEvent[]): FeedbackOrigin[] {
  const out: FeedbackOrigin[] = [];
  if (feedback.some((f) => f.origin === 'synthetic') || events.some((e) => e.origin === 'synthetic')) {
    out.push('synthetic');
  }
  if (feedback.some((f) => f.origin === 'user-provided') || events.some((e) => e.origin === 'user-provided')) {
    out.push('user-provided');
  }
  return out.length > 0 ? out : ['synthetic'];
}

export function validatePayload(p: IssuePayload): string[] {
  const errs: string[] = [];
  if (!p.title.trim()) errs.push('Title is required.');
  if (p.title.length > 120) errs.push('Title exceeds 120 chars.');
  if (!p.body.trim()) errs.push('Body is required.');
  if (p.body.length > 20000) errs.push('Body exceeds 20000 chars.');
  return errs;
}

export interface SubmitResult {
  ok: boolean;
  remoteId?: string;
  error?: string;
  duplicate?: boolean;
  /** True only for explicitly simulated successes, never real deliveries. */
  simulated?: boolean;
}

/**
 * Validation-only mock adapter for the public demo. It never touches the
 * network and never records anything: with no authorized destination every
 * attempt stays a failure, including retries. Receipts below belong only to
 * explicit simulations.
 */
const simulatedReceipts = new Map<string, string>();

function receiptKey(payload: IssuePayload): string {
  let h = 0;
  const s = `${payload.title}\n${payload.body}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `payload-${Math.abs(h)}`;
}

export function mockSubmit(payload: IssuePayload): SubmitResult {
  const errs = validatePayload(payload);
  if (errs.length > 0) return { ok: false, error: errs.join(' ') };
  return { ok: false, error: 'No demo destination configured in this browser session. Payload validated; nothing was sent.' };
}

/**
 * Explicitly simulated success, visibly labeled as such. Records a simulated
 * receipt only after the simulated success so repeats return the same
 * simulated ID instead of inventing new ones.
 */
export function simulateSubmit(payload: IssuePayload): SubmitResult {
  const errs = validatePayload(payload);
  if (errs.length > 0) return { ok: false, error: errs.join(' ') };
  const key = receiptKey(payload);
  const hit = simulatedReceipts.get(key);
  if (hit) return { ok: true, remoteId: hit, duplicate: true, simulated: true };
  const remoteId = `simulated-${key}`;
  simulatedReceipts.set(key, remoteId);
  return { ok: true, remoteId, simulated: true };
}

/** Clear every dedupe store: simulated receipts and nothing else persists. */
export function clearMockSubmissions(): void {
  simulatedReceipts.clear();
}

/** Back-compat alias kept for older call sites; clears all dedupe state. */
export function resetMock(): void {
  clearMockSubmissions();
}

/** Issue export (Markdown download or mock submission) requires an approved decision. */
export function canExportDecision(d: Decision): boolean {
  return d.state === 'approved' && validateDecisionContent(d).ok;
}

/**
 * Headings alone are not content: every decision field must carry non-blank
 * text, or the approval/export gates (including restored approvals) refuse it.
 */
export function validateDecisionContent(d: Decision): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const fields: [string, string][] = [
    ['problem', d.problem],
    ['evidence', d.evidence],
    ['alternatives', d.alternatives],
    ['scope', d.scope],
    ['non-goals', d.nonGoals],
    ['acceptance criteria', d.acceptance],
    ['success metric', d.metric],
  ];
  fields.forEach(([label, v]) => {
    if (!v || v.trim().length === 0) errors.push(`Decision ${label} is blank. Fill it in before approval.`);
  });
  return { ok: errors.length === 0, errors };
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable fingerprint of the supporting evidence (events, feedback, themes). */
export function evidenceSnapshot(input: { events: LabEvent[]; feedback: FeedbackRecord[]; themes: Theme[] }): string {
  return fnv1a(JSON.stringify(input));
}

function approvalStamp(d: Decision, snapshot: string): string {
  return fnv1a(
    [d.problem, d.evidence, d.alternatives, d.scope, d.nonGoals, d.acceptance, d.metric, snapshot].join('\n')
  );
}

/**
 * Approve a decision, binding the approval to the current evidence snapshot.
 * Refuses when decision content is blank.
 */
export function approveDecision(
  d: Decision,
  snapshot: string
): { ok: true; decision: Decision } | { ok: false; errors: string[] } {
  const content = validateDecisionContent(d);
  if (!content.ok) return { ok: false, errors: content.errors };
  const next: Decision = { ...d, state: 'approved' };
  return { ok: true, decision: { ...next, approvalStamp: approvalStamp(next, snapshot) } };
}

/**
 * An approval stays valid only while the approved contents AND the supporting
 * evidence snapshot still match. Upstream evidence changes (or a restored
 * approval without a stamp) read as unapproved.
 */
export function isApprovalCurrent(d: Decision, snapshot: string): boolean {
  if (d.state !== 'approved') return false;
  if (typeof d.approvalStamp !== 'string') return false;
  return d.approvalStamp === approvalStamp({ ...d, approvalStamp: undefined }, snapshot);
}

/** Funnel numbers for a single stage, included in the export with explicit provenance. */
export interface FunnelExportInfo {
  stageLabel: string;
  entered: number;
  converted: number;
  dropped: number;
  dropPct: number;
  eligibleCohort: number;
  /** Reporting window label, e.g. "Feb 5 – Apr 14, 2025" (from the eligible cohort's signup dates). */
  periodLabel: string;
}

/** Markdown export of the decision handoff, from the single persisted decision. */
export function decisionToMarkdown(
  d: Decision,
  origins: FeedbackOrigin[] = ['synthetic'],
  funnel?: FunnelExportInfo
): string {
  const funnelSection = funnel
    ? [
        `## Funnel evidence (derived from synthetic funnel data)`,
        `Reporting window: ${funnel.periodLabel}`,
        `Stage: ${funnel.stageLabel}`,
        `Entered: ${funnel.entered}`,
        `Converted: ${funnel.converted}`,
        `Dropped: ${funnel.dropped} accounts (${funnel.dropPct}%)`,
        `Eligible cohort: ${funnel.eligibleCohort}`,
        ``,
      ]
    : [];
  return [
    `# Issue: ${d.problem}`,
    ``,
    `State: ${d.state}`,
    ``,
    `## Problem`,
    d.problem,
    ``,
    `## Supporting evidence`,
    d.evidence,
    ``,
    `## Alternatives`,
    d.alternatives,
    ``,
    `## Scope`,
    d.scope,
    ``,
    `## Non-goals`,
    d.nonGoals,
    ``,
    `## Acceptance criteria`,
    d.acceptance,
    ``,
    `## Success metric`,
    d.metric,
    ``,
    ...funnelSection,
    `_${provenanceFooter(origins)}_`,
  ].join('\n');
}
