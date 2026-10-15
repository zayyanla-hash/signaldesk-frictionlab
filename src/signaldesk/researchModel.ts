import { parseStrictDate, isValidHttpUrl } from '../lib/datetime';

export const CRITERIA = [
  { key: 'product', short: 'PROD', label: 'Product fit', question: 'B2B software with a concrete operations or GTM use case.' },
  { key: 'customer', short: 'ICP', label: 'Customer clarity', question: 'Public evidence identifies a customer segment or buyer.' },
  { key: 'geography', short: 'US', label: 'US context', question: 'Public company or role context in SF Bay Area, Remote US, or New York.' },
  { key: 'timing', short: 'NOW', label: 'Timing signal', question: 'A recent launch, hiring need, or expansion creates a reason to investigate now. This is not purchase intent.' },
  { key: 'workflow', short: 'NEED', label: 'Workflow need', question: 'Direct evidence of an unmet workflow problem at this company. A product feature or analyst hypothesis is insufficient.' },
  { key: 'access', short: 'PATH', label: 'Public route', question: 'A public careers, contact, or discovery route is available. No relationship is implied.' },
] as const;
export type Criterion = typeof CRITERIA[number]['key'];
export type EvidenceKind = 'fact' | 'inference' | 'unknown';
export type Verification = 'unverified' | 'verified' | 'disputed';
export type Stance = 'supports' | 'contradicts' | 'neutral';
export interface EvidenceRecord {
  id: string;
  criterion: Criterion;
  claim: string;
  excerpt: string;
  sourceTitle: string;
  sourceUrl: string;
  publicationDate: string | null;
  retrievalDate: string | null;
  kind: EvidenceKind;
  verification: Verification;
  stance: Stance;
  note: string;
}
export interface AnalystBrief {
  customerHypothesis: string;
  problemHypothesis: string;
  questions: string;
  nextStep: string;
}
export interface ResearchAccount {
  id: string;
  name: string;
  domain: string;
  sector: string;
  origin: 'independent' | 'user';
  evidence: EvidenceRecord[];
  brief: AnalystBrief;
  review: 'draft' | 'reviewed';
  reviewedAt: string | null;
  updatedAt: string;
}
export interface ResearchWorkspace { version: 2; accounts: ResearchAccount[]; }
export const RESEARCH_STORAGE = 'sd-research-ledger-v2';
export const MAX_RESEARCH_ACCOUNTS = 100;
export const MAX_EVIDENCE = 200;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_WORKSPACE_BYTES = 8_000_000;
export const emptyBrief = (): AnalystBrief => ({ customerHypothesis: '', problemHypothesis: '', questions: '', nextStep: '' });
export function today(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); }
export function newId(): string { return crypto.randomUUID(); }
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && parseStrictDate(value).ok;
}
export function validSourceUrl(value: string): boolean {
  if (!isValidHttpUrl(value) || value.length > 2000 || (Array.from(value).some(c => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127) || /[<>`"\\]/.test(value))) return false;
  const u = new URL(value);
  return !u.username && !u.password;
}
export function validDomain(value: string): boolean {
  return value.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max: number, required = false): x is string => typeof x === 'string' && x.length <= max && (!required || !!x.trim());
const enumOf = <T extends string>(x: unknown, options: readonly T[]): x is T => typeof x === 'string' && options.includes(x as T);
export function evidenceErrors(e: unknown, now = today()): string[] {
  if (!record(e)) return ['Evidence must be an object.'];
  const errors: string[] = [];
  if (!text(e.id, 100, true)) errors.push('Evidence ID is required (100 characters maximum).');
  if (!enumOf(e.criterion, CRITERIA.map(c => c.key))) errors.push('Choose a valid qualification question.');
  if (!text(e.claim, 800, true)) errors.push('Claim is required (800 characters maximum).');
  if (!text(e.excerpt, 4000)) errors.push('Excerpt must be text (4,000 characters maximum).');
  if (!text(e.sourceTitle, 200)) errors.push('Source title must be text (200 characters maximum).');
  if (!text(e.sourceUrl, 2000) || (e.sourceUrl !== '' && !validSourceUrl(e.sourceUrl as string))) errors.push('Source must be a complete HTTP(S) URL without credentials.');
  for (const key of ['publicationDate', 'retrievalDate'] as const) {
    if (e[key] !== null && !validDate(e[key])) errors.push(`${key}: use a real YYYY-MM-DD date or leave unknown.`);
    else if (typeof e[key] === 'string' && e[key] > now) errors.push(`${key} cannot be in the future.`);
  }
  if (typeof e.publicationDate === 'string' && typeof e.retrievalDate === 'string' && e.publicationDate > e.retrievalDate) errors.push('Publication date cannot follow retrieval date.');
  if (!enumOf(e.kind, ['fact', 'inference', 'unknown'])) errors.push('Invalid evidence type.');
  if (!enumOf(e.verification, ['unverified', 'verified', 'disputed'])) errors.push('Invalid verification status.');
  if (!enumOf(e.stance, ['supports', 'contradicts', 'neutral'])) errors.push('Invalid claim stance.');
  if (!text(e.note, 1000)) errors.push('Review note must be text (1,000 characters maximum).');
  if (e.verification === 'verified' && (!e.sourceUrl || typeof e.excerpt !== 'string' || !e.excerpt.trim() || !e.retrievalDate)) errors.push('Verification requires a source URL, excerpt and retrieval date.');
  if (e.kind === 'unknown' && e.verification === 'verified') errors.push('An unknown cannot be verified.');
  return errors;
}
export function isEvidence(x: unknown): x is EvidenceRecord { return evidenceErrors(x).length === 0; }
export function isResearchAccount(x: unknown): x is ResearchAccount {
  if (!record(x) || !text(x.id, 100, true) || !text(x.name, 100, true) || !text(x.domain, 253) || !validDomain(x.domain) || !text(x.sector, 100) || !enumOf(x.origin, ['independent', 'user'])) return false;
  if (!Array.isArray(x.evidence) || x.evidence.length > MAX_EVIDENCE || !x.evidence.every(isEvidence) || new Set(x.evidence.map(e => e.id)).size !== x.evidence.length) return false;
  if (!record(x.brief) || !['customerHypothesis', 'problemHypothesis', 'questions', 'nextStep'].every(key => text((x.brief as Record<string, unknown>)[key], 1200))) return false;
  return enumOf(x.review, ['draft', 'reviewed']) && (x.reviewedAt === null || validDate(x.reviewedAt) && x.reviewedAt <= today()) && validDate(x.updatedAt) && x.updatedAt <= today() && (x.review !== 'reviewed' || x.reviewedAt !== null);
}
export function isWorkspace(x: unknown): x is ResearchWorkspace {
  return record(x) && x.version === 2 && new TextEncoder().encode(JSON.stringify(x)).length <= MAX_WORKSPACE_BYTES && Array.isArray(x.accounts) && x.accounts.length <= MAX_RESEARCH_ACCOUNTS && x.accounts.every(isResearchAccount) && new Set(x.accounts.map(a => a.id)).size === x.accounts.length && new Set(x.accounts.map(a => a.domain.toLowerCase())).size === x.accounts.length;
}
export function evidenceAge(e: EvidenceRecord, now = today()): { stale: boolean; days: number | null; reason: string } {
  if (!e.retrievalDate) return { stale: false, days: null, reason: 'Retrieval date unknown; source has not been checked.' };
  const daysSince = (date: string) => Math.floor((Date.parse(`${now}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  const days = daysSince(e.retrievalDate);
  const limit = e.criterion === 'timing' || e.criterion === 'access' ? 90 : 180;
  if (days > limit) return { stale: true, days, reason: `Last retrieved ${days} days ago; refresh after ${limit} days.` };
  if (e.criterion === 'timing' && e.publicationDate && daysSince(e.publicationDate) > 90) return { stale: true, days, reason: 'Timing event was published more than 90 days ago; a fresh retrieval does not make it recent.' };
  return { stale: false, days, reason: e.publicationDate ? `Published ${e.publicationDate}; retrieved ${e.retrievalDate}.` : `Retrieved ${e.retrievalDate}; publication date unknown.` };
}
export type AssessmentState = 'supported' | 'contrary' | 'unknown' | 'conflict' | 'stale';
export interface Assessment { criterion: Criterion; state: AssessmentState; reason: string; evidence: EvidenceRecord[]; }
export function assessCriterion(account: ResearchAccount, criterion: Criterion, now = today()): Assessment {
  const evidence = account.evidence.filter(e => e.criterion === criterion);
  const facts = evidence.filter(e => e.kind === 'fact' && e.sourceUrl && e.excerpt.trim() && e.retrievalDate && e.stance !== 'neutral');
  // Disputed or opposing sourced claims block automatic resolution, even when one is old.
  // A human must revise, remove or neutralize the outdated claim explicitly.
  const reviewedFacts = facts.filter(e => e.verification !== 'unverified');
  const opposing = facts.some(e => e.stance === 'supports') && facts.some(e => e.stance === 'contradicts');
  if (opposing || reviewedFacts.some(e => e.verification === 'disputed')) return { criterion, state: 'conflict', reason: 'Sourced claims disagree or a claim is disputed. Resolve the evidence before qualification.', evidence };
  const verified = facts.filter(e => e.verification === 'verified');
  const fresh = verified.filter(e => !evidenceAge(e, now).stale);
  if (fresh.length) {
    const positive = fresh[0].stance === 'supports';
    return { criterion, state: positive ? 'supported' : 'contrary', reason: `${fresh.length} current, verified source record${fresh.length === 1 ? '' : 's'} ${positive ? 'support' : 'contradict'} this question. ${criterion === 'timing' ? 'Context only; buying intent is unknown.' : ''}`.trim(), evidence };
  }
  if (verified.length) return { criterion, state: 'stale', reason: 'Only stale verified evidence is available. Refresh the source before using it.', evidence };
  return { criterion, state: 'unknown', reason: evidence.length ? 'Evidence is missing a checked source, is unverified, or is an inference. No qualification credit.' : 'No evidence captured. Unknown is not a negative score.', evidence };
}
export function qualify(account: ResearchAccount, now = today()) {
  const assessments = CRITERIA.map(c => assessCriterion(account, c.key, now));
  const supported = assessments.filter(a => a.state === 'supported').length;
  const contrary = assessments.filter(a => a.state === 'contrary').length;
  const assessed = supported + contrary;
  const conflicts = assessments.filter(a => a.state === 'conflict').length;
  const stale = assessments.filter(a => a.state === 'stale').length;
  const score = assessed ? Math.round(supported / assessed * 100) : null;
  const geography = assessments.find(a => a.criterion === 'geography')!;
  const label = conflicts ? 'Resolve conflict' : geography.state === 'contrary' ? 'Outside target' : stale ? 'Refresh evidence' : supported >= 4 && geography.state === 'supported' ? 'Worth investigating' : 'Needs research';
  return { assessments, supported, contrary, assessed, unknown: 6 - assessed, conflicts, stale, score, label };
}
export function reviseAccount(a: ResearchAccount, patch: Partial<ResearchAccount>): ResearchAccount {
  return { ...a, ...patch, review: 'draft', reviewedAt: null, updatedAt: today() };
}
export function blankAccount(name: string, domain: string): ResearchAccount {
  return { id: newId(), name: name.trim(), domain: domain.trim().toLowerCase(), sector: 'Unclassified', origin: 'user', evidence: [], brief: emptyBrief(), review: 'draft', reviewedAt: null, updatedAt: today() };
}
export function blankEvidence(criterion: Criterion = 'product'): EvidenceRecord {
  return { id: newId(), criterion, claim: '', excerpt: '', sourceTitle: '', sourceUrl: '', publicationDate: null, retrievalDate: null, kind: 'fact', verification: 'unverified', stance: 'supports', note: '' };
}
export function readWorkspace(raw: string | null, fallback: ResearchWorkspace): { workspace: ResearchWorkspace; notice: string } {
  if (raw === null) return { workspace: fallback, notice: '' };
  try {
    const value: unknown = JSON.parse(raw);
    if (isWorkspace(value)) return { workspace: value, notice: '' };
    return { workspace: fallback, notice: 'Saved research failed schema or version validation. Examples are shown; the saved value is preserved until you save a change. Download the recovery copy before editing.' };
  } catch { return { workspace: fallback, notice: 'Saved research could not be read. Examples are shown; the saved value is preserved until you save a change. Download the recovery copy before editing.' }; }
}
