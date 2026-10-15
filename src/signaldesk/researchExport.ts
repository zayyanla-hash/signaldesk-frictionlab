import { CRITERIA, evidenceAge, qualify, today, type EvidenceRecord, type ResearchAccount } from './researchModel';

export interface BriefFact { text: string; evidence: EvidenceRecord; citation: number; }
export function briefFacts(account: ResearchAccount): BriefFact[] {
  const q = qualify(account);
  // One fact per qualification question keeps the shared brief concise.
  // Every fact carries its exact source; blocked claims never enter this section.
  const records = CRITERIA.flatMap(c => {
    if (q.assessments.find(a => a.criterion === c.key)?.state !== 'supported') return [];
    const e = account.evidence.find(x => x.criterion === c.key && x.kind === 'fact' && x.verification === 'verified' && x.stance === 'supports' && !evidenceAge(x).stale);
    return e ? [e] : [];
  });
  return records.map((e, i) => ({ text: e.claim, evidence: e, citation: i + 1 }));
}
export function briefUnknowns(account: ResearchAccount): string[] {
  return qualify(account).assessments.filter(a => a.state !== 'supported').map(a => `${CRITERIA.find(c => c.key === a.criterion)!.label}: ${a.reason}`);
}
export function escapeMarkdown(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}[\]#|])/g, '\\$1');
}
export function researchMarkdown(a: ResearchAccount): string {
  const q = qualify(a);
  const facts = briefFacts(a);
  return [
    `# ${escapeMarkdown(a.name)} — independent account research`,
    `Prepared by Zayyan Latif with SignalDesk · ${today()}`,
    'Independent public-source work sample. No employment, client relationship, endorsement, or private company access is claimed.',
    `## Qualification\n${q.label}. ${q.supported} supported / ${q.assessed} assessed; ${q.unknown} unknown or blocked. This is a research heuristic, not purchase probability.`,
    '## Supported facts', ...facts.map(f => `- ${escapeMarkdown(f.text)} [${f.citation}]`),
    `## Likely customer — analyst hypothesis\n${escapeMarkdown(a.brief.customerHypothesis) || 'Not drafted.'}`,
    `## Plausible workflow problem — analyst hypothesis\n${escapeMarkdown(a.brief.problemHypothesis) || 'Not drafted. No problem has been established.'}`,
    `## Open questions\n${escapeMarkdown(a.brief.questions) || 'What evidence would change this assessment?'}`,
    ...briefUnknowns(a).map(x => `- ${x}`),
    `## Proposed next step\n${escapeMarkdown(a.brief.nextStep) || 'Capture and verify evidence before prioritizing.'}`,
    '## Sources', ...facts.map(f => `[${f.citation}] ${escapeMarkdown(f.evidence.sourceTitle) || 'Source'} — ${f.evidence.sourceUrl}\nPublished: ${f.evidence.publicationDate ?? 'unknown'} · Retrieved: ${f.evidence.retrievalDate ?? 'unknown'}\nExcerpt: ${escapeMarkdown(f.evidence.excerpt)}`),
    `\nReview: ${a.review === 'reviewed' ? `Analyst reviewed ${a.reviewedAt}` : 'Draft — not reviewed'}. Verification confirms source matching, not independent audit of company statements.`,
  ].join('\n\n');
}
export function exportLimitations(a: ResearchAccount): string[] {
  const facts = briefFacts(a);
  const warnings: string[] = [];
  if (!facts.length) warnings.push('No supported facts are available. The brief will show research gaps.');
  if (a.review !== 'reviewed') warnings.push('This brief is a draft. Review the facts and hypotheses before sharing.');
  const q = qualify(a);
  if (q.conflicts) warnings.push('Conflicting claims are excluded from supported facts. Resolve them in the evidence ledger.');
  if (q.stale) warnings.push('Stale claims are excluded from supported facts. Refresh the original sources.');
  return warnings;
}
