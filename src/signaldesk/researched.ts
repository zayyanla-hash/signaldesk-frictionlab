import { isRecord, isStringArray } from '../lib/storage';
import packet from './researchPacket.json';
import fitResearchData from './fitResearch.json';
import type { Account, DatasetProvenance } from './types';

export interface ResearchRecord {
  company: string;
  domain: string;
  source_url: string;
  publication_date: string | null;
  observation: string;
  problem_hypothesis: string;
  discovery_question: string;
  reason_not_to_pursue: string;
}

export interface ResearchPacket {
  retrieved_date: string;
  retrieved_date_timezone: string;
  method: string;
  offering: string;
  dates: string;
  scoring_rubric: string;
  limitations: string;
  records: ResearchRecord[];
  shared_brief_fields: {
    buyer_function: string;
    unknowns: string[];
    next_validation_step: string;
    outreach_template: string;
  };
}

/* ---------- fit capability research (fitResearch.json) ---------- */

export interface FitCapabilityEntry {
  documented: boolean;
  source_url?: string;
  paraphrase?: string;
  note?: string;
}

export interface FitResearchRecord {
  company: string;
  domain: string;
  capabilities: Record<string, FitCapabilityEntry>;
}

export interface FitResearch {
  retrieved_date: string;
  method: string;
  capabilities: string[];
  records: FitResearchRecord[];
}

function isFitCapabilityEntry(x: unknown): x is FitCapabilityEntry {
  if (!isRecord(x)) return false;
  if (typeof x.documented !== 'boolean') return false;
  if (x.source_url !== undefined && typeof x.source_url !== 'string') return false;
  if (x.paraphrase !== undefined && typeof x.paraphrase !== 'string') return false;
  if (x.note !== undefined && typeof x.note !== 'string') return false;
  return true;
}

export function isFitResearch(x: unknown): x is FitResearch {
  if (!isRecord(x)) return false;
  if (typeof x.retrieved_date !== 'string' || typeof x.method !== 'string') return false;
  if (!isStringArray(x.capabilities) || x.capabilities.length === 0) return false;
  if (!Array.isArray(x.records) || x.records.length === 0) return false;
  return x.records.every((r: unknown) => {
    if (!isRecord(r)) return false;
    if (typeof r.company !== 'string' || typeof r.domain !== 'string') return false;
    if (!isRecord(r.capabilities)) return false;
    return Object.values(r.capabilities).every(isFitCapabilityEntry);
  });
}

/** Human label for a capability key, used in signal labels and unknown summaries. */
const CAPABILITY_LABELS: Record<string, string> = {
  signature_verification: 'Signature verification',
  retry_policy: 'Retry policy',
  delivery_logs: 'Delivery logs',
  manual_redelivery: 'Manual redelivery',
  event_filtering: 'Event filtering',
  local_testing: 'Local testing',
};

function capabilityLabel(key: string): string {
  return CAPABILITY_LABELS[key] ?? key;
}

export function isResearchPacket(x: unknown): x is ResearchPacket {
  if (!isRecord(x)) return false;
  if (typeof x.retrieved_date !== 'string' || typeof x.retrieved_date_timezone !== 'string') return false;
  if (typeof x.method !== 'string' || typeof x.offering !== 'string' || typeof x.dates !== 'string') return false;
  if (typeof x.scoring_rubric !== 'string' || typeof x.limitations !== 'string') return false;
  if (!Array.isArray(x.records) || x.records.length === 0) return false;
  const recOk = x.records.every(
    (r: unknown) =>
      isRecord(r) &&
      typeof r.company === 'string' &&
      typeof r.domain === 'string' &&
      typeof r.source_url === 'string' &&
      (r.publication_date === null || typeof r.publication_date === 'string') &&
      typeof r.observation === 'string' &&
      typeof r.problem_hypothesis === 'string' &&
      typeof r.discovery_question === 'string' &&
      typeof r.reason_not_to_pursue === 'string'
  );
  if (!recOk) return false;
  const s = x.shared_brief_fields;
  return (
    isRecord(s) &&
    typeof s.buyer_function === 'string' &&
    isStringArray(s.unknowns) &&
    typeof s.next_validation_step === 'string' &&
    typeof s.outreach_template === 'string'
  );
}

export const RESEARCH_DATASET: DatasetProvenance = {
  kind: 'researched',
  note: 'Twelve webhook-documenting vendors with independently checked primary documentation URLs. Sources document capabilities, not purchasing demand. RelayWatch is fictional.',
};

/** Companies flagged explicitly needs-review, with the packet's own rationale. */
const NEEDS_REVIEW = new Set(['shopify.com', 'asana.com']);

function slug(domain: string): string {
  return domain.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Build the per-domain capability fact/unknown signals for the researched fit score.
 * One 'fact' signal per documented:true capability (cited to its own source_url);
 * at most one 'unknown' signal naming gaps, wording a docs-stated absence
 * differently from mere absence of evidence.
 */
function buildFitSignals(idSlug: string, fit: FitResearchRecord, fitData: FitResearch): Account['signals'] {
  const signals: Account['signals'] = [];
  const notFound: string[] = [];
  const documentedAbsence: { label: string; note: string; sourceUrl: string | null }[] = [];

  for (const key of fitData.capabilities) {
    const entry = fit.capabilities[key];
    if (!entry) continue;
    const label = capabilityLabel(key);
    if (entry.documented) {
      signals.push({
        id: `res-${idSlug}-cap-${key}`,
        kind: 'fact' as const,
        label: `${label} documented`,
        detail: entry.paraphrase ?? `${label} is documented in official docs.`,
        sourceNote: `Official documentation: ${entry.source_url ?? 'unknown'} (collected ${fitData.retrieved_date}).`,
        provenance: {
          origin: 'researched' as const,
          sourceUrl: entry.source_url ?? null,
          publicationDate: null,
          retrievalDate: fitData.retrieved_date,
        },
      });
    } else if (entry.source_url && entry.note) {
      // Docs explicitly state the absence, e.g. "GitHub does not auto-redeliver."
      documentedAbsence.push({ label, note: entry.note, sourceUrl: entry.source_url });
    } else {
      notFound.push(label);
    }
  }

  if (notFound.length > 0 || documentedAbsence.length > 0) {
    const parts: string[] = [];
    if (documentedAbsence.length > 0) {
      parts.push(documentedAbsence.map((d) => `${d.label}: ${d.note}`).join(' '));
    }
    if (notFound.length > 0) {
      parts.push(`Not found in official docs: ${notFound.join(', ')}.`);
    }
    const absenceSourceUrl = documentedAbsence.length === 1 ? documentedAbsence[0].sourceUrl : null;
    signals.push({
      id: `res-${idSlug}-cap-unknown`,
      kind: 'unknown' as const,
      label: 'Capabilities not confirmed',
      detail: parts.join(' '),
      sourceNote: `Checked against ${fit.company}'s official documentation (collected ${fitData.retrieved_date}). Absence of evidence is not evidence of absence, except where noted as a documented absence.`,
      provenance: {
        origin: 'researched' as const,
        sourceUrl: absenceSourceUrl,
        publicationDate: null,
        retrievalDate: fitData.retrieved_date,
      },
    });
  }

  return signals;
}

/**
 * Build investigation accounts from the curated packet. Never invents signals:
 * every fact is the packet observation (or a cited capability from fitResearch.json),
 * every hypothesis/discovery/unknown comes from the packet or fitResearch.json, and
 * fit is the share of webhook capabilities documented in official docs.
 */
export function buildResearchedAccounts(p: ResearchPacket): Account[] {
  if (!isResearchPacket(p)) throw new Error('Research packet failed validation.');
  if (!isFitResearch(fitResearchData)) throw new Error('Bundled fit research failed validation.');
  const fitByDomain = new Map<string, FitResearchRecord>(
    fitResearchData.records.map((rec) => [rec.domain.toLowerCase(), rec])
  );
  return p.records.map((r) => {
    const needsReview = NEEDS_REVIEW.has(r.domain.toLowerCase());
    const idSlug = slug(r.domain);
    const fitRecord = fitByDomain.get(r.domain.toLowerCase());
    const documentedCount = fitRecord
      ? Object.values(fitRecord.capabilities).filter((c) => c.documented).length
      : 0;
    const fitScore = fitRecord ? Math.round((100 * documentedCount) / fitResearchData.capabilities.length) : 0;
    const fitSignals = fitRecord ? buildFitSignals(idSlug, fitRecord, fitResearchData) : [];
    return {
      id: `res-${slug(r.domain)}`,
      company: r.company,
      domain: r.domain.toLowerCase(),
      employees: 'Unknown',
      industry: 'Unknown',
      headquarters: 'Unknown',
      scores: { fit: fitScore, intent: 0, engagement: 0, timing: 0 },
      evidenceQuality: needsReview ? ('needs-review' as const) : ('medium' as const),
      exclusionReason: null,
      dataset: 'researched' as const,
      scoreOrigin: 'analyst-heuristic' as const,
      reviewNote: needsReview
        ? `Explicitly needs review: ${r.reason_not_to_pursue}`
        : 'Researched investigation example. Starts in review; fit score is the share of 6 webhook capabilities documented in official docs, an analyst heuristic, not demand evidence.',
      signals: [
        {
          id: `res-${slug(r.domain)}-fact`,
          kind: 'fact' as const,
          label: 'Documented integration surface',
          detail: r.observation,
          sourceNote: `Primary documentation: ${r.source_url} (published unknown; collected ${p.retrieved_date} ${p.retrieved_date_timezone}). Capability documented, not purchasing demand.`,
          provenance: {
            origin: 'researched' as const,
            sourceUrl: r.source_url,
            publicationDate: r.publication_date,
            retrievalDate: p.retrieved_date,
          },
        },
        ...fitSignals,
        {
          id: `res-${slug(r.domain)}-hyp`,
          kind: 'hypothesis' as const,
          label: 'Problem hypothesis (unvalidated)',
          detail: r.problem_hypothesis,
          sourceNote: 'Analyst hypothesis from the research packet, not an observed fact.',
          provenance: { origin: 'researched' as const, sourceUrl: null, publicationDate: null, retrievalDate: p.retrieved_date },
        },
        {
          id: `res-${slug(r.domain)}-next`,
          kind: 'next-step' as const,
          label: 'Next validation step',
          detail: p.shared_brief_fields.next_validation_step,
          sourceNote: 'Shared validation step from the research packet.',
          provenance: { origin: 'researched' as const, sourceUrl: null, publicationDate: null, retrievalDate: p.retrieved_date },
        },
      ],
      problem: r.problem_hypothesis,
      buyerFunction: p.shared_brief_fields.buyer_function,
      unknowns: [...p.shared_brief_fields.unknowns],
      reasonsNotToPursue: [r.reason_not_to_pursue],
      discoveryQuestion: r.discovery_question,
      outreachDraft: p.shared_brief_fields.outreach_template,
      reviewState: 'in-review' as const,
    };
  });
}

export function getResearchPacket(): ResearchPacket {
  if (!isResearchPacket(packet)) throw new Error('Bundled research packet failed validation.');
  return packet;
}

export function getResearchedAccounts(): Account[] {
  return buildResearchedAccounts(getResearchPacket());
}
