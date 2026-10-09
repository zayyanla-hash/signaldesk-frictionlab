import { DEFAULT_WEIGHTS, type Account, type ICPCriteria, type ScoreWeights } from './types';

export interface ScoreBreakdown {
  total: number;
  parts: { key: keyof ScoreWeights; score: number; weight: number; contribution: number }[];
  excluded: boolean;
  exclusionReason: string | null;
}

const KEYS: (keyof ScoreWeights)[] = ['fit', 'intent', 'engagement', 'timing'];

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sanitizeWeight(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

export interface NormalizedWeights {
  weights: ScoreWeights;
  /** True when every sanitized weight was 0, so equal weights were used. */
  equalFallback: boolean;
}

/**
 * Normalize weights to a bounded weighted average. Non-finite and negative
 * inputs sanitize to 0 (the UI validates before saving; scoring stays safe
 * regardless). All-zero weights fall back to equal weighting, documented in
 * the UI, instead of producing a meaningless 0 for every account.
 * Scaled ratios keep normalization finite for any allowed input: even
 * extreme values such as 1e308 in several fields cannot overflow the sum.
 */
export function normalizeWeights(raw: ScoreWeights): NormalizedWeights {
  const clean: ScoreWeights = {
    fit: sanitizeWeight(raw.fit),
    intent: sanitizeWeight(raw.intent),
    engagement: sanitizeWeight(raw.engagement),
    timing: sanitizeWeight(raw.timing),
  };
  const peak = Math.max(clean.fit, clean.intent, clean.engagement, clean.timing);
  if (!(peak > 0)) {
    return { weights: { fit: 25, intent: 25, engagement: 25, timing: 25 }, equalFallback: true };
  }
  const scaled: ScoreWeights = { fit: 0, intent: 0, engagement: 0, timing: 0 };
  let total = 0;
  KEYS.forEach((k) => {
    scaled[k] = clean[k] / peak;
    total += scaled[k];
  });
  KEYS.forEach((k) => {
    scaled[k] = (scaled[k] * 100) / total;
  });
  return { weights: scaled, equalFallback: false };
}

export interface WeightValidation {
  ok: boolean;
  errors: string[];
}

/** UI gate: only finite nonnegative numbers may be saved. Normalization handles the rest. */
export function validateWeights(raw: Record<string, unknown>): WeightValidation {
  const errors: string[] = [];
  KEYS.forEach((k) => {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${k} must be a finite number.`);
    } else if (v < 0) {
      errors.push(`${k} must be 0 or greater.`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/**
 * Deterministic heuristic scoring as a bounded 0..100 weighted average.
 * Missing evidence scores 0, never positive. Visible contributions use
 * largest-remainder rounding so they always sum to the displayed total.
 */
export function scoreAccount(
  account: Account,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  criteria?: ICPCriteria
): ScoreBreakdown {
  const { weights: w } = normalizeWeights(weights);
  const exact = KEYS.map((key) => {
    const raw = account.scores[key];
    const score = clampScore(typeof raw === 'number' ? raw : 0);
    return { key, score, weight: Math.round(w[key] * 10) / 10, points: (score * w[key]) / 100 };
  });
  const total = Math.max(0, Math.min(100, Math.round(exact.reduce((s, p) => s + p.points, 0))));
  const floors = exact.map((p) => Math.floor(p.points));
  let remainder = total - floors.reduce((s, f) => s + f, 0);
  const order = exact
    .map((p, i) => ({ i, frac: p.points - Math.floor(p.points) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const contributions = [...floors];
  for (const o of order) {
    if (remainder <= 0) break;
    contributions[o.i]++;
    remainder--;
  }
  const parts = exact.map((p, i) => ({ key: p.key, score: p.score, weight: p.weight, contribution: contributions[i] }));

  let excluded = false;
  let exclusionReason: string | null = account.exclusionReason;
  if (account.exclusionReason) excluded = true;
  if (criteria) {
    const c = checkExclusions(account, criteria);
    if (c.excluded) {
      excluded = true;
      exclusionReason = c.reason;
    }
  }
  return { total, parts, excluded, exclusionReason };
}

const QUALITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, 'needs-review': 0 };

export function checkExclusions(
  account: Account,
  criteria: ICPCriteria
): { excluded: boolean; reason: string | null } {
  const count = parseEmployeeCount(account.employees);
  if (count !== null && (count < criteria.minEmployees || count > criteria.maxEmployees)) {
    return { excluded: true, reason: `Headcount ${account.employees} outside ${criteria.minEmployees}-${criteria.maxEmployees}` };
  }
  if (criteria.excludedIndustries.includes(account.industry)) {
    return { excluded: true, reason: `Industry excluded: ${account.industry}` };
  }
  if (criteria.includedIndustries.length > 0 && !criteria.includedIndustries.includes(account.industry)) {
    return { excluded: true, reason: `Industry not in target list: ${account.industry}` };
  }
  if (criteria.excludedDomains.includes(account.domain.toLowerCase())) {
    return { excluded: true, reason: `Domain excluded: ${account.domain}` };
  }
  if (account.existingCustomer) return { excluded: true, reason: 'Existing customer' };
  if (criteria.requireEvidenceQuality !== 'any') {
    const need = QUALITY_RANK[criteria.requireEvidenceQuality] ?? 0;
    const have = QUALITY_RANK[account.evidenceQuality] ?? 0;
    if (have < need) {
      return { excluded: true, reason: `Evidence quality ${account.evidenceQuality} below required ${criteria.requireEvidenceQuality}` };
    }
  }
  return { excluded: false, reason: null };
}

export function parseEmployeeCount(label: string): number | null {
  const m = label.replace(/,/g, '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return Math.round((parseInt(m[1], 10) + parseInt(m[2], 10)) / 2);
  const single = label.replace(/,/g, '').match(/(\d+)/);
  return single ? parseInt(single[1], 10) : null;
}

export function rankAccounts(accounts: Account[], weights: ScoreWeights, criteria: ICPCriteria): Account[] {
  return [...accounts].sort((a, b) => {
    const sa = scoreAccount(a, weights, criteria);
    const sb = scoreAccount(b, weights, criteria);
    if (sa.excluded !== sb.excluded) return sa.excluded ? 1 : -1;
    return sb.total - sa.total;
  });
}
