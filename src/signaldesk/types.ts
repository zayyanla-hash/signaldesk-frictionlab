import { isValidHttpUrl, parseStrictDate } from '../lib/datetime';
import { isNumberRecord, isRecord, isStringArray } from '../lib/storage';

export type EvidenceQuality = 'high' | 'medium' | 'low' | 'needs-review';
export type ReviewState = 'unreviewed' | 'in-review' | 'approved' | 'rejected';

/** Where a piece of evidence came from. Imported rows are never synthetic. */
export type EvidenceOrigin = 'synthetic-sample' | 'researched' | 'user-import';

export interface SignalProvenance {
  origin: EvidenceOrigin;
  /** Validated HTTP(S) URL, or null when absent or invalid (invalid never kept). */
  sourceUrl: string | null;
  /** Validated publication date (YYYY-MM-DD), or null when unknown. Unknown stays unknown. */
  publicationDate: string | null;
  /** Date the evidence was collected or imported (YYYY-MM-DD). */
  retrievalDate: string | null;
}

export interface Signal {
  id: string;
  kind: 'fact' | 'hypothesis' | 'unknown' | 'next-step';
  label: string;
  detail: string;
  sourceNote: string;
  provenance: SignalProvenance;
}

export interface AccountScoreInput {
  fit: number; // 0-100 ICP fit
  intent: number; // 0-100 buying intent signals
  engagement: number; // 0-100 engagement / activity
  timing: number; // 0-100 timing / recency
}

/** Scores supplied with a CSV import are user assertions, not substantiated facts. */
export type ScoreOrigin = 'sample' | 'user-asserted' | 'analyst-heuristic';

export interface ScoreWeights {
  fit: number;
  intent: number;
  engagement: number;
  timing: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = { fit: 30, intent: 25, engagement: 20, timing: 25 };

export interface Account {
  id: string;
  company: string;
  domain: string;
  employees: string;
  industry: string;
  headquarters: string;
  scores: AccountScoreInput;
  evidenceQuality: EvidenceQuality;
  exclusionReason: string | null;
  existingCustomer?: boolean;
  scoreOrigin: ScoreOrigin;
  /** Which built-in dataset this account came from, or a user import. */
  dataset: 'synthetic' | 'researched' | 'imported';
  /** Why this account sits in review (missing evidence, user assertions, ...). */
  reviewNote?: string;
  signals: Signal[];
  problem?: string;
  buyerFunction?: string;
  unknowns?: string[];
  reasonsNotToPursue?: string[];
  discoveryQuestion?: string;
  outreachDraft?: string;
  reviewState: ReviewState;
}

export interface ICPCriteria {
  minEmployees: number;
  maxEmployees: number;
  includedIndustries: string[];
  excludedIndustries: string[];
  excludedDomains: string[];
  requireEvidenceQuality: EvidenceQuality | 'any';
}

/**
 * Provenance for a whole account dataset. The built-in sample is synthetic;
 * a researched dataset would arrive separately with its own provenance and
 * must never be mixed with invented signals.
 */
export interface DatasetProvenance {
  kind: 'synthetic-sample' | 'researched';
  note: string;
}

export const SYNTHETIC_DATASET: DatasetProvenance = {
  kind: 'synthetic-sample',
  note: 'All companies are fictional, domains use reserved .example, and no public sources are claimed.',
};

/* ---------- storage shape guards ---------- */

const WEIGHT_KEYS = ['fit', 'intent', 'engagement', 'timing'];

export function isScoreWeights(x: unknown): x is ScoreWeights {
  return isNumberRecord(x, WEIGHT_KEYS);
}

export function isICPCriteria(x: unknown): x is ICPCriteria {
  if (!isRecord(x)) return false;
  const nums: [string, unknown][] = [
    ['minEmployees', x.minEmployees],
    ['maxEmployees', x.maxEmployees],
  ];
  for (const [, v] of nums) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  const min = x.minEmployees as number;
  const max = x.maxEmployees as number;
  if (min > max) return false;
  return (
    isStringArray(x.includedIndustries) &&
    isStringArray(x.excludedIndustries) &&
    isStringArray(x.excludedDomains) &&
    (x.requireEvidenceQuality === 'any' ||
      x.requireEvidenceQuality === 'high' ||
      x.requireEvidenceQuality === 'medium' ||
      x.requireEvidenceQuality === 'low' ||
      x.requireEvidenceQuality === 'needs-review')
  );
}

function isBoundedScores(x: unknown): x is AccountScoreInput {
  if (!isRecord(x)) return false;
  return WEIGHT_KEYS.every((k) => typeof x[k] === 'number' && Number.isFinite(x[k]) && x[k] >= 0 && x[k] <= 100);
}

function isSignalProvenance(x: unknown): x is SignalProvenance {
  if (!isRecord(x)) return false;
  // Stored URLs must use a safe protocol or the provenance is rejected:
  // no unsafe-protocol href may become clickable after tampering.
  const urlOk = x.sourceUrl === null || (typeof x.sourceUrl === 'string' && isValidHttpUrl(x.sourceUrl));
  // Stored dates must be real calendar dates (YYYY-MM-DD) or unknown.
  // Impossible dates such as 2025-02-30 never validate.
  const datesOk =
    (x.publicationDate === null ||
      (typeof x.publicationDate === 'string' && parseStrictDate(x.publicationDate).ok)) &&
    (x.retrievalDate === null ||
      (typeof x.retrievalDate === 'string' && parseStrictDate(x.retrievalDate).ok));
  return (
    (x.origin === 'synthetic-sample' || x.origin === 'researched' || x.origin === 'user-import') &&
    urlOk &&
    datesOk
  );
}

function isSignal(x: unknown): x is Signal {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === 'string' &&
    (x.kind === 'fact' || x.kind === 'hypothesis' || x.kind === 'unknown' || x.kind === 'next-step') &&
    typeof x.label === 'string' &&
    typeof x.detail === 'string' &&
    typeof x.sourceNote === 'string' &&
    isSignalProvenance(x.provenance)
  );
}

export function isAccount(x: unknown): x is Account {
  if (!isRecord(x)) return false;
  const optStrings: (keyof Account)[] = ['problem', 'buyerFunction', 'discoveryQuestion', 'outreachDraft', 'reviewNote'];
  const optOk = optStrings.every((k) => x[k] === undefined || typeof x[k] === 'string');
  const optArrays: (keyof Account)[] = ['unknowns', 'reasonsNotToPursue'];
  const arrOk = optArrays.every((k) => x[k] === undefined || isStringArray(x[k]));
  return (
    typeof x.id === 'string' &&
    x.id.length > 0 &&
    typeof x.company === 'string' &&
    typeof x.domain === 'string' &&
    typeof x.employees === 'string' &&
    typeof x.industry === 'string' &&
    typeof x.headquarters === 'string' &&
    isBoundedScores(x.scores) &&
    (x.evidenceQuality === 'high' || x.evidenceQuality === 'medium' || x.evidenceQuality === 'low' || x.evidenceQuality === 'needs-review') &&
    (x.exclusionReason === null || typeof x.exclusionReason === 'string') &&
    (x.existingCustomer === undefined || typeof x.existingCustomer === 'boolean') &&
    (x.scoreOrigin === 'sample' || x.scoreOrigin === 'user-asserted' || x.scoreOrigin === 'analyst-heuristic') &&
    (x.dataset === 'synthetic' || x.dataset === 'researched' || x.dataset === 'imported') &&
    optOk &&
    arrOk &&
    Array.isArray(x.signals) &&
    x.signals.every(isSignal) &&
    (x.reviewState === 'unreviewed' || x.reviewState === 'in-review' || x.reviewState === 'approved' || x.reviewState === 'rejected')
  );
}

export function isAccountArray(x: unknown): x is Account[] {
  if (!Array.isArray(x) || x.length === 0 || x.length > ACCOUNT_COLLECTION_CAP) return false;
  const ids = new Set<string>();
  return x.every((a) => {
    if (!isAccount(a)) return false;
    if (ids.has(a.id)) return false;
    ids.add(a.id);
    return true;
  });
}

/** Cap on persisted/imported account collections (repeated imports stay bounded). */
export const ACCOUNT_COLLECTION_CAP = 2000;

export interface CriteriaValidation {
  ok: boolean;
  errors: string[];
}

/** Semantic criteria validation: finite, nonnegative, consistent ranges. */
export function validateCriteria(c: ICPCriteria): CriteriaValidation {
  const errors: string[] = [];
  for (const [label, v] of [['Minimum headcount', c.minEmployees], ['Maximum headcount', c.maxEmployees]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${label} must be a finite number.`);
    else if (v < 0) errors.push(`${label} must be 0 or greater.`);
  }
  if (errors.length === 0 && c.minEmployees > c.maxEmployees) {
    errors.push(`Minimum headcount (${c.minEmployees}) contradicts maximum (${c.maxEmployees}).`);
  }
  return { ok: errors.length === 0, errors };
}
