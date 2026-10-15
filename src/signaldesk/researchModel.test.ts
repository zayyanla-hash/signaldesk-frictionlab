import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { assessCriterion, blankAccount, blankEvidence, evidenceAge, evidenceErrors, isResearchAccount, isWorkspace, qualify, readWorkspace, reviseAccount, validDomain, validSourceUrl } from './researchModel';
import { exampleWorkspace } from './researchExamples';
import { briefFacts, briefUnknowns, exportLimitations, researchMarkdown } from './researchExport';
const NOW = '2026-10-14';
const evidence = (patch = {}) => ({ ...blankEvidence(), claim: 'A sourced product claim', excerpt: 'Original source passage', sourceUrl: 'https://example.com/product', retrievalDate: NOW, verification: 'verified' as const, ...patch });
const account = () => blankAccount('Example', 'example.com');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T19:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('research schema and provenance', () => {
  it('ships exactly three distinct valid independent accounts with source-matched provenance', () => {
    const w = exampleWorkspace();
    expect(isWorkspace(w)).toBe(true); expect(w.accounts).toHaveLength(3);
    for (const a of w.accounts) {
      expect(a.origin).toBe('independent'); expect(a.evidence.length).toBeGreaterThanOrEqual(5);
      expect(a.evidence.every(e => e.sourceUrl && e.excerpt && e.retrievalDate === NOW)).toBe(true);
      expect(a.brief.problemHypothesis).toMatch(/hypothesis|possible|no evidence/i);
    }
  });
  it('rejects script, file and credential-bearing citation URLs', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'https://user:secret@example.com', 'https://x']) expect(validSourceUrl(url)).toBe(false);
    expect(validSourceUrl('https://docs.example.com/a?b=c#d')).toBe(true);
  });
  it('validates domains without interpreting a company name as a URL', () => {
    expect(validDomain('example.com')).toBe(true);
    for (const d of ['https://example.com', 'x', 'bad domain.com', 'a.com/path', '-a.com', 'a..com']) expect(validDomain(d)).toBe(false);
  });
  it('rejects impossible dates, future dates, and publication after retrieval', () => {
    expect(evidenceErrors(evidence({ publicationDate: '2026-02-30' }), NOW).join(' ')).toMatch(/real/);
    expect(evidenceErrors(evidence({ retrievalDate: '2027-01-01' }), NOW).join(' ')).toMatch(/future/);
    expect(evidenceErrors(evidence({ publicationDate: '2026-10-10', retrievalDate: '2026-10-01' }), NOW).join(' ')).toMatch(/follow/);
  });
  it('requires a URL, excerpt and retrieval date for verification', () => {
    for (const patch of [{ sourceUrl: '' }, { excerpt: '' }, { retrievalDate: null }]) expect(evidenceErrors(evidence(patch), NOW).join(' ')).toMatch(/Verification requires/);
    expect(evidenceErrors(evidence({ kind: 'unknown' }), NOW).join(' ')).toMatch(/unknown cannot/);
  });
  it('bounds all text, record counts and unique IDs', () => {
    const a = account(); a.evidence = [evidence()]; expect(isResearchAccount(a)).toBe(true);
    a.evidence.push(a.evidence[0]); expect(isResearchAccount(a)).toBe(false);
    expect(evidenceErrors(evidence({ claim: 'x'.repeat(801) }), NOW).length).toBeGreaterThan(0);
    const b = account(); b.id = 'different';
    expect(isWorkspace({ version: 2, accounts: [account(), b] })).toBe(false);
  });
});

describe('explainable qualification', () => {
  it('leaves missing data unknown with a null score, never zero', () => {
    const q = qualify(account(), NOW);
    expect(q.score).toBe(null); expect(q.assessed).toBe(0); expect(q.unknown).toBe(6);
    expect(q.assessments.every(a => a.state === 'unknown' && a.reason.includes('Unknown'))).toBe(true);
  });
  it('shows the assessed denominator and evidence behind the score', () => {
    const a = account(); a.evidence = [evidence()];
    const q = qualify(a, NOW);
    expect(q.score).toBe(100); expect(q.supported).toBe(1); expect(q.assessed).toBe(1); expect(q.unknown).toBe(5); expect(q.label).toBe('Needs research');
    expect(q.assessments[0].evidence).toEqual(a.evidence); expect(q.assessments[0].reason).toMatch(/verified/);
  });
  it('allows an explicit contrary fact to earn a known zero', () => {
    const a = account(); a.evidence = [evidence({ stance: 'contradicts' })];
    const q = qualify(a, NOW); expect(q.score).toBe(0); expect(q.contrary).toBe(1); expect(q.assessed).toBe(1);
  });
  it('never credits unverified, neutral, unknown or inferred evidence', () => {
    for (const patch of [{ verification: 'unverified' }, { stance: 'neutral' }, { kind: 'unknown' }, { kind: 'inference' }]) {
      const a = account(); a.evidence = [evidence(patch)]; expect(qualify(a, NOW).score).toBe(null);
    }
  });
  it('flags old retrievals and expires timing events even when retrieved today', () => {
    expect(evidenceAge(evidence({ retrievalDate: '2026-04-16' }), NOW).stale).toBe(true);
    expect(evidenceAge(evidence({ criterion: 'timing', publicationDate: '2026-06-18' }), NOW).stale).toBe(true);
    expect(evidenceAge(evidence({ criterion: 'product', publicationDate: '2020-01-01' }), NOW).stale).toBe(false);
    const a = account(); a.evidence = [evidence({ retrievalDate: '2025-01-01' })]; expect(assessCriterion(a, 'product', NOW).state).toBe('stale'); expect(qualify(a, NOW).score).toBe(null);
  });
  it('treats the freshness boundary consistently', () => {
    expect(evidenceAge(evidence({ criterion: 'timing', retrievalDate: '2026-07-16' }), NOW).stale).toBe(false);
    expect(evidenceAge(evidence({ criterion: 'timing', retrievalDate: '2026-07-15' }), NOW).stale).toBe(true);
    expect(evidenceAge(evidence({ retrievalDate: null }), NOW).days).toBe(null);
  });
  it('blocks conflicting or disputed source claims rather than choosing a convenient positive', () => {
    const a = account(); a.evidence = [evidence(), evidence({ stance: 'contradicts', retrievalDate: '2025-01-01' })];
    expect(assessCriterion(a, 'product', NOW).state).toBe('conflict'); expect(qualify(a, NOW).label).toBe('Resolve conflict');
    a.evidence = [evidence({ verification: 'disputed' })]; expect(assessCriterion(a, 'product', NOW).state).toBe('conflict');
  });
  it('a contrary US assessment excludes an account from the target', () => {
    const a = account(); a.evidence = [evidence({ criterion: 'geography', stance: 'contradicts' })]; expect(qualify(a, NOW).label).toBe('Outside target');
  });
  it('invalidates review after any evidence or brief edit', () => {
    const a = { ...account(), review: 'reviewed' as const, reviewedAt: NOW };
    const changed = reviseAccount(a, { brief: { ...a.brief, nextStep: 'Check the source.' } });
    expect(changed.review).toBe('draft'); expect(changed.reviewedAt).toBe(null);
  });
});

describe('research persistence and export', () => {
  it('round-trips without dropping claims, dates, review, or analyst text', () => {
    const w = exampleWorkspace(); expect(readWorkspace(JSON.stringify(w), exampleWorkspace()).workspace).toEqual(w);
  });
  it('restores a genuinely empty workspace rather than reseeding examples', () => {
    expect(readWorkspace('{"version":2,"accounts":[]}', exampleWorkspace()).workspace.accounts).toEqual([]);
  });
  it('refuses corrupt or future schemas and reports recovery honestly', () => {
    for (const raw of ['broken', '{"version":99,"accounts":[]}', '{"version":2,"accounts":[{}]}']) {
      const r = readWorkspace(raw, exampleWorkspace()); expect(r.notice).toMatch(/preserved/); expect(r.workspace.accounts).toHaveLength(3);
    }
    expect(readWorkspace(null, exampleWorkspace()).notice).toBe('');
  });
  it('exports only supported current facts, with exact citations and independent-work language', () => {
    const a = exampleWorkspace().accounts[0];
    expect(briefFacts(a)).toHaveLength(5);
    const markdown = researchMarkdown(a);
    expect(markdown).toContain('Independent public-source work sample'); expect(markdown).toContain('No employment'); expect(markdown).toContain('Published: unknown'); expect(markdown).toContain('Retrieved: 2026-10-14'); expect(markdown).toContain(a.evidence[0].sourceUrl);
    expect(briefUnknowns(a).join(' ')).toMatch(/Workflow need/); expect(exportLimitations(a).join(' ')).toMatch(/draft/);
  });
  it('excludes blocked claims from the supported section and exposes the gap', () => {
    const a = exampleWorkspace().accounts[0]; a.evidence.push({ ...a.evidence[0], id: 'opposing', stance: 'contradicts' });
    expect(briefFacts(a).some(f => f.evidence.criterion === 'product')).toBe(false);
    expect(briefUnknowns(a).join(' ')).toMatch(/disagree/); expect(exportLimitations(a).join(' ')).toMatch(/Conflicting/);
  });
});

describe('additional evidence safety cases', () => {
  it('flags a sourced unchecked counterclaim for human resolution', () => {
    const a = account(); a.evidence = [evidence(), evidence({ verification: 'unverified', stance: 'contradicts' })];
    expect(assessCriterion(a, 'product', NOW).state).toBe('conflict');
  });
  it('exports HTML and Markdown from analyst text as inert text', () => {
    const a = account(); a.brief.problemHypothesis = '<script>alert(1)</script> [click](javascript:alert(2))';
    const md = researchMarkdown(a); expect(md).not.toContain('<script>'); expect(md).toContain('&lt;script&gt;'); expect(md).not.toContain('[click](');
  });
});

describe('independent review regressions', () => {
  it('rejects a whitespace-only verified excerpt and never gives it qualification credit', () => {
    const e=evidence({excerpt:'   \n\t'});expect(evidenceErrors(e,NOW).join(' ')).toMatch(/Verification requires/);
    const a=account();a.evidence=[e];expect(qualify(a,NOW).score).toBe(null);
  });
});
