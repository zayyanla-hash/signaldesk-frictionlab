import { toCSV } from '../lib/utils';
import { scoreAccount } from './scoring';
import { SYNTHETIC_DATASET, type Account, type ICPCriteria, type ScoreWeights } from './types';

export function criteriaSummary(criteria: ICPCriteria): string {
  const parts = [
    `headcount ${criteria.minEmployees}-${criteria.maxEmployees}`,
    criteria.includedIndustries.length > 0
      ? `industries only: ${criteria.includedIndustries.join(', ')}`
      : 'all industries except excluded',
  ];
  if (criteria.excludedIndustries.length > 0) parts.push(`excluded industries: ${criteria.excludedIndustries.join(', ')}`);
  if (criteria.excludedDomains.length > 0) parts.push(`excluded domains: ${criteria.excludedDomains.join(', ')}`);
  if (criteria.requireEvidenceQuality !== 'any') parts.push(`minimum evidence quality: ${criteria.requireEvidenceQuality}`);
  return parts.join('; ');
}

function provenanceLine(a: Account): string {
  const imported = a.signals.some((s) => s.provenance.origin === 'user-import');
  if (imported || a.dataset === 'imported') {
    return 'Provenance: user-provided CSV import, unverified. Not a researched fact and not part of the synthetic sample.';
  }
  if (a.dataset === 'researched') {
    return 'Provenance: researched investigation examples. Primary documentation URLs below describe product capabilities, not purchasing demand. RelayWatch is fictional; no listed company is a customer or validated buyer.';
  }
  return `Provenance: ${SYNTHETIC_DATASET.kind}. ${SYNTHETIC_DATASET.note}`;
}

export function briefToMarkdown(a: Account, weights: ScoreWeights, criteria?: ICPCriteria): string {
  const s = scoreAccount(a, weights, criteria);
  const lines: string[] = [];
  lines.push(`# Account brief: ${a.company}`);
  lines.push('');
  lines.push(`- Domain: ${a.domain}`);
  lines.push(`- Score: ${s.total} (heuristic, not a purchase probability)`);
  lines.push(`- Review state: ${a.reviewState}`);
  if (criteria) lines.push(`- Target criteria: ${criteriaSummary(criteria)}`);
  if (s.excluded) {
    lines.push(`- Excluded: ${s.exclusionReason}`);
  } else {
    lines.push(`- Excluded: no`);
  }
  if (a.scoreOrigin === 'user-asserted') {
    lines.push(`- Scores: user assertions from import, not substantiated facts`);
  } else if (a.scoreOrigin === 'analyst-heuristic') {
    lines.push(`- Scores: analyst investigation heuristic (fit only), not demand evidence`);
  }
  if (a.reviewNote) lines.push(`- Review note: ${a.reviewNote}`);
  lines.push('');
  lines.push('## Observed facts');
  const facts = a.signals.filter((x) => x.kind === 'fact');
  if (facts.length === 0) lines.push('- (none recorded)');
  facts.forEach((x) => {
    lines.push(`- ${x.label}: ${x.detail}`);
    const p = x.provenance;
    const originNote =
      p.origin === 'user-import'
        ? 'user-provided import, unverified'
        : p.origin === 'researched'
          ? 'researched primary source (capability, not demand)'
          : 'synthetic sample, no public source';
    const collected = p.retrievalDate
      ? p.origin === 'user-import'
        ? `imported on ${p.retrievalDate}`
        : `collected ${p.retrievalDate}`
      : 'collection date unknown';
    const bits = [
      originNote,
      p.sourceUrl ? `source ${p.sourceUrl}` : 'no source URL',
      `published ${p.publicationDate ?? 'unknown'}`,
      collected,
    ];
    lines.push(`  (${bits.join('; ')})`);
  });
  lines.push('');
  lines.push('## Proposed problem');
  lines.push(a.problem ?? '(not written)');
  lines.push('');
  lines.push('## Buyer function');
  lines.push(a.buyerFunction ?? '(unknown)');
  lines.push('');
  lines.push('## Unknowns');
  (a.unknowns ?? []).forEach((u) => lines.push(`- ${u}`));
  lines.push('');
  lines.push('## Reasons not to pursue');
  (a.reasonsNotToPursue ?? []).forEach((u) => lines.push(`- ${u}`));
  lines.push('');
  lines.push('## Discovery question');
  lines.push(a.discoveryQuestion ?? '(none)');
  lines.push('');
  lines.push('## Outreach draft (editable in app)');
  lines.push(a.outreachDraft ?? '(none)');
  lines.push('');
  lines.push(`_${provenanceLine(a)}_`);
  return lines.join('\n');
}

/** Accounts eligible for the approved export: approved AND not hard-excluded. */
export function eligibleExportAccounts(
  accounts: Account[],
  weights: ScoreWeights,
  criteria: ICPCriteria
): { eligible: Account[]; approvedExcluded: Account[] } {
  const eligible: Account[] = [];
  const approvedExcluded: Account[] = [];
  accounts.forEach((a) => {
    if (a.reviewState !== 'approved') return;
    const s = scoreAccount(a, weights, criteria);
    if (s.excluded) approvedExcluded.push(a);
    else eligible.push(a);
  });
  return { eligible, approvedExcluded };
}

export function approvedToCSV(accounts: Account[], weights: ScoreWeights, criteria: ICPCriteria): string {
  const { eligible } = eligibleExportAccounts(accounts, weights, criteria);
  const rows: string[][] = [['company', 'domain', 'score', 'review_state', 'evidence_quality', 'score_origin']];
  eligible.forEach((a) => {
    const s = scoreAccount(a, weights, criteria);
    rows.push([a.company, a.domain, String(s.total), a.reviewState, a.evidenceQuality, a.scoreOrigin]);
  });
  return toCSV(rows);
}
