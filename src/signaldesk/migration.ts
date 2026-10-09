import { isValidHostname, isValidHttpUrl, parseStrictDate } from '../lib/datetime';
import {
  ACCOUNT_COLLECTION_CAP,
  isAccount,
  type Account,
  type EvidenceOrigin,
  type EvidenceQuality,
  type ReviewState,
} from './types';

export interface MigrationResult {
  accounts: Account[];
  /** Human-readable notes about repairs; empty when nothing needed fixing. */
  notes: string[];
  dropped: number;
}

const QUALITIES: EvidenceQuality[] = ['high', 'medium', 'low', 'needs-review'];
const STATES: ReviewState[] = ['unreviewed', 'in-review', 'approved', 'rejected'];
const KINDS = ['fact', 'hypothesis', 'unknown', 'next-step'] as const;
const ORIGINS: EvidenceOrigin[] = ['synthetic-sample', 'researched', 'user-import'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampScore(n: unknown): { value: number; repaired: boolean } {  if (typeof n !== 'number' || !Number.isFinite(n)) return { value: 0, repaired: n !== undefined };
  if (n < 0) return { value: 0, repaired: true };
  if (n > 100) return { value: 100, repaired: true };
  return { value: Math.round(n), repaired: false };
}

function cleanDate(v: unknown): { value: string | null; repaired: boolean } {
  if (v === undefined || v === null) return { value: null, repaired: false };
  if (typeof v !== 'string' || !DATE_RE.test(v)) return { value: null, repaired: true };
  const parsed = parseStrictDate(v);
  if (!parsed.ok) return { value: null, repaired: true };
  return { value: parsed.date, repaired: false };
}

/**
 * Safely migrate persisted accounts saved by older app versions, or reject
 * them with visible notes. Rules:
 * - Only plain saved arrays migrate; unknown shapes are rejected outright.
 * - Out-of-range scores clamp, empty/duplicate IDs drop, unsafe provenance
 *   URLs become null, malformed dates become unknown.
 * - Unknown origins are inferred from the record's dataset, never relabeled
 *   synthetic when the record looks imported (and vice versa).
 * - Any material repair discards a stored approval: repaired contents return
 *   to in-review because exports must represent current reviewed content.
 * - Migrated output is re-validated; anything still invalid is dropped.
 * - Collections stay capped; excess records drop with a note.
 */
export function migrateAccounts(raw: unknown): MigrationResult {
  const notes: string[] = [];
  if (!Array.isArray(raw) || raw.length === 0) return { accounts: [], notes, dropped: 0 };
  const seen = new Set<string>();
  const accounts: Account[] = [];
  let dropped = 0;
  let clamped = 0;
  let coerced = 0;
  let deapproved = 0;

  for (const item of raw) {
    if (accounts.length >= ACCOUNT_COLLECTION_CAP) {
      dropped++;
      continue;
    }
    if (typeof item !== 'object' || item === null) {
      dropped++;
      continue;
    }
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const company = typeof r.company === 'string' ? r.company : '';
    if (!id || !company) {
      dropped++;
      continue;
    }
    if (seen.has(id)) {
      dropped++;
      notes.push(`Dropped duplicate account ID "${id}".`);
      continue;
    }
    seen.add(id);
    if (typeof r.domain !== 'string' || !isValidHostname(r.domain)) {
      dropped++;
      notes.push(`Dropped "${company}": stored domain is not a valid hostname.`);
      continue;
    }
    const scoresRaw = (r.scores ?? {}) as Record<string, unknown>;
    const fit = clampScore(scoresRaw.fit);
    const intent = clampScore(scoresRaw.intent);
    const engagement = clampScore(scoresRaw.engagement);
    const timing = clampScore(scoresRaw.timing);
    const scores = { fit: fit.value, intent: intent.value, engagement: engagement.value, timing: timing.value };
    let repaired = fit.repaired || intent.repaired || engagement.repaired || timing.repaired;
    if (repaired) clamped++;

    const dataset: Account['dataset'] =
      r.dataset === 'researched' || r.dataset === 'imported'
        ? r.dataset
        : id.startsWith('csv-')
          ? 'imported'
          : 'synthetic';
    const signals: Account['signals'] = [];
    let signalsDropped = 0;
    if (Array.isArray(r.signals)) {
      for (const s of r.signals) {
        if (typeof s !== 'object' || s === null) {
          signalsDropped++;
          continue;
        }
        const sv = s as Record<string, unknown>;
        if (
          typeof sv.id !== 'string' ||
          !(KINDS as readonly string[]).includes(String(sv.kind)) ||
          typeof sv.label !== 'string' ||
          typeof sv.detail !== 'string'
        ) {
          signalsDropped++;
          continue;
        }
        const p = (sv.provenance ?? {}) as Record<string, unknown>;
        // Never relabel across the synthetic/imported boundary: unknown
        // origins follow the record's dataset, not a synthetic default.
        const origin: EvidenceOrigin = ORIGINS.includes(p.origin as EvidenceOrigin)
          ? (p.origin as EvidenceOrigin)
          : dataset === 'imported'
            ? 'user-import'
            : dataset === 'researched'
              ? 'researched'
              : 'synthetic-sample';
        if (p.origin !== undefined && p.origin !== origin) {
          coerced++;
          repaired = true;
        }
        const sourceUrl = typeof p.sourceUrl === 'string' && isValidHttpUrl(p.sourceUrl) ? p.sourceUrl : null;
        if (typeof p.sourceUrl === 'string' && p.sourceUrl && sourceUrl === null) {
          // Repaired unsafe source URL: the evidence changed, so any stored
          // approval must not survive migration.
          coerced++;
          repaired = true;
        }
        const publicationDate = cleanDate(p.publicationDate);
        const retrievalDate = cleanDate(p.retrievalDate);
        if (publicationDate.repaired || retrievalDate.repaired) {
          coerced++;
          repaired = true;
        }
        signals.push({
          id: String(sv.id),
          kind: sv.kind as Account['signals'][number]['kind'],
          label: String(sv.label),
          detail: String(sv.detail),
          sourceNote: typeof sv.sourceNote === 'string' ? sv.sourceNote : '',
          provenance: { origin, sourceUrl, publicationDate: publicationDate.value, retrievalDate: retrievalDate.value },
        });
      }
    } else if (r.signals !== undefined) {
      repaired = true;
    }
    if (signalsDropped > 0) {
      repaired = true;
      notes.push(`Dropped ${signalsDropped} malformed signal(s) on "${company}".`);
    }
    const reviewState: ReviewState = STATES.includes(r.reviewState as ReviewState)
      ? (r.reviewState as ReviewState)
      : 'unreviewed';
    if (reviewState !== r.reviewState) repaired = true;
    const quality: EvidenceQuality = QUALITIES.includes(r.evidenceQuality as EvidenceQuality)
      ? (r.evidenceQuality as EvidenceQuality)
      : 'needs-review';
    if (quality !== r.evidenceQuality) repaired = true;
    if (r.exclusionReason !== undefined && r.exclusionReason !== null && typeof r.exclusionReason !== 'string') {
      repaired = true;
    }
    for (const k of ['unknowns', 'reasonsNotToPursue'] as const) {
      if (r[k] !== undefined && !(Array.isArray(r[k]) && (r[k] as unknown[]).every((u) => typeof u === 'string'))) {
        repaired = true;
      }
    }
    // Materially repaired contents lose a stored approval. Legacy records
    // (saved before the dataset field existed) are conservatively re-reviewed.
    const isLegacy = r.dataset === undefined;
    const finalState =
      reviewState === 'approved' && (repaired || isLegacy) ? ('in-review' as const) : reviewState;
    if (finalState !== reviewState) {
      deapproved++;
      notes.push(
        repaired
          ? `"${company}" was repaired, so its stored approval returned to in-review.`
          : `"${company}" was saved by an older version, so its stored approval returned to in-review.`
      );
    }
    const candidate: Account = {
      id,
      company,
      domain: String(r.domain).toLowerCase(),
      employees: typeof r.employees === 'string' ? r.employees : 'Unknown',
      industry: typeof r.industry === 'string' ? r.industry : 'Unknown',
      headquarters: typeof r.headquarters === 'string' ? r.headquarters : 'Unknown',
      scores,
      evidenceQuality: quality,
      exclusionReason: typeof r.exclusionReason === 'string' ? r.exclusionReason : null,
      existingCustomer: r.existingCustomer === true,
      scoreOrigin:
        r.scoreOrigin === 'user-asserted' || r.scoreOrigin === 'analyst-heuristic' ? r.scoreOrigin : 'sample',
      dataset,
      ...(typeof r.reviewNote === 'string' ? { reviewNote: r.reviewNote } : {}),
      signals,
      ...(typeof r.problem === 'string' ? { problem: r.problem } : {}),
      ...(typeof r.buyerFunction === 'string' ? { buyerFunction: r.buyerFunction } : {}),
      ...(Array.isArray(r.unknowns) && r.unknowns.every((u) => typeof u === 'string') ? { unknowns: r.unknowns as string[] } : {}),
      ...(Array.isArray(r.reasonsNotToPursue) && r.reasonsNotToPursue.every((u) => typeof u === 'string')
        ? { reasonsNotToPursue: r.reasonsNotToPursue as string[] }
        : {}),
      ...(typeof r.discoveryQuestion === 'string' ? { discoveryQuestion: r.discoveryQuestion } : {}),
      ...(typeof r.outreachDraft === 'string' ? { outreachDraft: r.outreachDraft } : {}),
      reviewState: finalState,
    };
    // Re-validate migrated output; anything still invalid is dropped, never kept.
    if (!isAccount(candidate)) {
      dropped++;
      notes.push(`Dropped "${company}": migrated record still failed validation.`);
      continue;
    }
    accounts.push(candidate);
  }

  if (clamped > 0) notes.push(`Clamped out-of-range scores to 0-100 on ${clamped} account(s).`);
  if (coerced > 0) notes.push(`Coerced ${coerced} unsafe stored provenance value(s) to safe defaults.`);
  if (deapproved > 0 && !notes.some((n) => n.includes('stored approval'))) {
    notes.push(`Returned ${deapproved} repaired approval(s) to in-review.`);
  }
  if (dropped > 0 && notes.length === 0) notes.push(`Dropped ${dropped} unsalvageable saved record(s).`);
  return { accounts, notes, dropped };
}
