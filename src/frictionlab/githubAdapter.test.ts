import { describe, expect, it } from 'vitest';
import {
  applyDecisionEdit,
  approveDecision,
  buildIssuePayload,
  canExportDecision,
  clearMockSubmissions,
  decisionToMarkdown,
  evidenceOrigins,
  evidenceSnapshot,
  isApprovalCurrent,
  mockSubmit,
  provenanceFooter,
  simulateSubmit,
  validateDecisionContent,
  validateHandoffApproval,
  validatePayload,
} from './githubAdapter';
import type { Decision } from './types';

const APPROVED: Decision = {
  problem: 'Source choice',
  evidence: 'e',
  alternatives: 'a',
  scope: 's',
  nonGoals: 'n',
  acceptance: 'ac',
  metric: 'm',
  state: 'approved',
};

describe('github adapter', () => {
  it('builds title and body from the single persisted problem', () => {
    const p = buildIssuePayload(APPROVED);
    expect(validatePayload(p)).toEqual([]);
    expect(p.title.length).toBeLessThanOrEqual(120);
    expect(p.title).toContain('Source choice');
    expect(p.body).toContain('Source choice');
    const md = decisionToMarkdown(APPROVED);
    expect(md.split('\n')[0]).toBe('# Issue: Source choice');
    expect(md.split('\n')[2]).toBe('State: approved');
  });

  it('rejects empty payloads (failure handling)', () => {
    expect(validatePayload({ title: '', body: '', labels: [] }).length).toBeGreaterThan(0);
  });

  it('keeps mock failures as failures on retry, never inventing remote IDs', () => {
    clearMockSubmissions();
    const p = buildIssuePayload(APPROVED);
    const first = mockSubmit(p);
    const second = mockSubmit(p);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(second.duplicate).toBeUndefined();
    expect(second.remoteId).toBeUndefined();
  });

  it('labels simulated successes and repeats the same simulated ID', () => {
    clearMockSubmissions();
    const p = buildIssuePayload(APPROVED);
    const first = simulateSubmit(p);
    expect(first.ok).toBe(true);
    expect(first.simulated).toBe(true);
    expect(first.remoteId).toMatch(/^simulated-/);
    const second = simulateSubmit(p);
    expect(second).toMatchObject({ ok: true, duplicate: true, simulated: true, remoteId: first.remoteId });
  });

  it('clearing resets all dedupe state', () => {
    clearMockSubmissions();
    const p = buildIssuePayload(APPROVED);
    const before = simulateSubmit(p);
    clearMockSubmissions();
    const after = simulateSubmit(p);
    expect(after.duplicate).toBeUndefined();
    expect(after.remoteId).toBe(before.remoteId);
  });

  it('refuses boilerplate approvals with blank decision fields', () => {
    const blank = { ...APPROVED, evidence: '   ' };
    expect(validateDecisionContent(blank).ok).toBe(false);
    expect(canExportDecision(blank)).toBe(false);
    expect(validateDecisionContent(APPROVED).ok).toBe(true);
  });

  it('binds approvals to an evidence snapshot and expires them on change', () => {
    const snap1 = evidenceSnapshot({ events: [], feedback: [], themes: [] });
    const snap2 = evidenceSnapshot({ events: [{ event_id: 'e', account_id: 'a', event_name: 'signed_up', occurred_at: '2025-03-01T10:00:00Z', origin: 'synthetic' }], feedback: [], themes: [] });
    const approved = approveDecision({ ...APPROVED, state: 'draft' }, snap1);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(isApprovalCurrent(approved.decision, snap1)).toBe(true);
    expect(isApprovalCurrent(approved.decision, snap2)).toBe(false);
    // Restored approvals without a stamp never read as current.
    expect(isApprovalCurrent({ ...APPROVED }, snap1)).toBe(false);
    // Blank content cannot be approved.
    expect(approveDecision({ ...APPROVED, state: 'draft', metric: '' }, snap1).ok).toBe(false);
  });

  it('declares event-only imports in handoff provenance', () => {
    const userEvent = { event_id: 'e', account_id: 'a', event_name: 'signed_up', occurred_at: '2025-03-01T10:00:00Z', origin: 'user-provided' as const };
    const synEvent = { ...userEvent, origin: 'synthetic' as const };
    expect(evidenceOrigins([], [userEvent])).toEqual(['user-provided']);
    expect(evidenceOrigins([], [synEvent])).toEqual(['synthetic']);
    expect(evidenceOrigins([{ feedback_id: 'f', account_id: 'a', text: 't', received_at: '2025-03-01T10:00:00Z', origin: 'synthetic' as const }], [userEvent])).toEqual(['synthetic', 'user-provided']);
    const md = decisionToMarkdown(APPROVED, evidenceOrigins([], [userEvent]));
    expect(md).toMatch(/user-provided records \(unverified\)/);
    expect(md).not.toMatch(/synthetic sample records/);
  });

  it('describes evidence provenance honestly in payloads', () => {
    expect(provenanceFooter(['synthetic'])).toMatch(/synthetic sample/);
    expect(provenanceFooter(['user-provided'])).toMatch(/unverified/);
    expect(provenanceFooter(['synthetic', 'user-provided'])).toMatch(/and/);
    const p = buildIssuePayload(APPROVED, ['user-provided']);
    expect(p.body).toMatch(/unverified/);
    expect(p.body).not.toMatch(/Synthetic data only/);
  });

  it('gates issue export on approval: draft and in-review are rejected', () => {
    expect(canExportDecision({ ...APPROVED, state: 'draft' })).toBe(false);
    expect(canExportDecision({ ...APPROVED, state: 'in-review' })).toBe(false);
    expect(canExportDecision(APPROVED)).toBe(true);
  });

  it('invalidates approval on substantive edits, including problem changes', () => {
    const edited = applyDecisionEdit(APPROVED, { evidence: 'new evidence' });
    expect(edited.invalidated).toBe(true);
    expect(edited.decision.state).toBe('draft');
    const problemChange = applyDecisionEdit(APPROVED, { problem: 'Other problem' });
    expect(problemChange.invalidated).toBe(true);
    const untouched = applyDecisionEdit(APPROVED, { state: 'approved' });
    expect(untouched.invalidated).toBe(false);
    const draftEdit = applyDecisionEdit({ ...APPROVED, state: 'draft' }, { evidence: 'x' });
    expect(draftEdit.invalidated).toBe(false);
  });

  it('validates handoff approval at the preamble only', () => {
    expect(validateHandoffApproval(decisionToMarkdown(APPROVED)).ok).toBe(true);
    expect(validateHandoffApproval(decisionToMarkdown({ ...APPROVED, state: 'draft' })).ok).toBe(false);
    const injected = `${decisionToMarkdown({ ...APPROVED, state: 'draft' })}\n## Notes\nState: approved\n`;
    expect(validateHandoffApproval(injected).ok).toBe(false);
    expect(validateHandoffApproval('State: approved\n\n## Problem\np\n').ok).toBe(false);
  });
});
