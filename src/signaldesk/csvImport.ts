import { isValidHostname, isValidHttpUrl, parseStrictDate } from '../lib/datetime';
import { parseCSVTable } from '../lib/csv';
import type { Account, EvidenceQuality } from './types';

export interface ImportResult {
  imported: Account[];
  quarantined: { row: number; company: string; reason: string }[];
  parseErrors: string[];
  skippedEmpty: number;
}

const EXPECTED = ['company', 'domain', 'source_url', 'source_date', 'evidence_text', 'tags'];

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// A cell that opens with a formula trigger (after leading whitespace) could
// execute as a spreadsheet formula if the row were ever re-exported and
// opened elsewhere. Export already neutralizes this (see lib/utils.ts
// csvSafe); imports quarantine it outright so a formula-like value never
// enters stored evidence text at all.
const FORMULA_START = /^\s*[=+\-@]/;

function looksLikeFormula(value: string): boolean {
  return FORMULA_START.test(value);
}

function parseTags(tags: string): { scores: Account['scores']; error: string | null } {
  const scores: Account['scores'] = { fit: 0, intent: 0, engagement: 0, timing: 0 };
  for (const part of tags.split(';')) {
    const text = part.trim();
    if (!text) continue;
    const m = text.match(/^(fit|intent|engagement|timing)\s*:\s*(\d{1,3})$/i);
    if (!m) return { scores, error: `Unrecognized tag "${text}". Use fit:0-100 and siblings, or leave tags blank.` };
    const v = Number(m[2]);
    if (!Number.isInteger(v) || v < 0 || v > 100) {
      return { scores, error: `Tag out of range "${text}". Scores must be whole numbers 0-100.` };
    }
    (scores as unknown as Record<string, number>)[m[1].toLowerCase()] = v;
  }
  return { scores, error: null };
}

function domainToHostname(domain: string): boolean {
  // Validate the domain field itself: paths, ports, and schemes are rejected.
  return isValidHostname(domain);
}

/**
 * Validate a fixed-schema SignalDesk import. Imported rows are user-provided
 * evidence, never synthetic facts and never validated classifications:
 * - Invalid URLs, hostnames, or dates quarantine the row with a reason.
 * - Rows without evidence text enter review with evidence-dependent scores at 0;
 *   supplied scoring tags are ignored in that case, never treated as facts.
 * - Rows with evidence text keep supplied tags only as user assertions.
 */
export function validateSignalCSV(text: string): ImportResult {
  const { header, rows, rowStarts, errors, skippedEmpty } = parseCSVTable(text);
  const quarantined: ImportResult['quarantined'] = [];
  const imported: Account[] = [];
  const retrievalDate = todayUTC();
  const seenCompanyDomain = new Map<string, number>();

  const missing = EXPECTED.filter((e) => !header.includes(e));
  if (missing.length > 0) {
    return {
      imported: [],
      quarantined: [],
      parseErrors: [
        ...errors,
        `Header missing required columns: ${missing.join(', ')}. Expected: ${EXPECTED.join(', ')}`,
      ],
      skippedEmpty,
    };
  }

  rows.forEach((r, i) => {
    // Physical record row: multiline fields shift naive i+2 indexing.
    const rowNum = rowStarts[i] ?? i + 2;
    const company = (r['company'] ?? '').trim();
    const domain = (r['domain'] ?? '').trim().toLowerCase();
    const sourceUrl = (r['source_url'] ?? '').trim();
    const sourceDate = (r['source_date'] ?? '').trim();
    const evidenceText = (r['evidence_text'] ?? '').trim();
    const tags = (r['tags'] ?? '').trim();

    if (!company) {
      quarantined.push({ row: rowNum, company: '(blank)', reason: 'Missing company name.' });
      return;
    }
    if (looksLikeFormula(company) || looksLikeFormula(evidenceText)) {
      quarantined.push({ row: rowNum, company, reason: 'Field starts with a formula trigger (=, +, - or @). Edit the value before importing.' });
      return;
    }
    if (!domain || !domainToHostname(domain)) {
      quarantined.push({ row: rowNum, company, reason: `Invalid domain "${domain}". Use a real hostname such as acme.example.` });
      return;
    }
    const dupKey = `${company.toLowerCase()}|${domain}`;
    const firstSeenRow = seenCompanyDomain.get(dupKey);
    if (firstSeenRow !== undefined) {
      quarantined.push({ row: rowNum, company, reason: `Duplicate of row ${firstSeenRow}: same company and domain already imported from this file.` });
      return;
    }
    seenCompanyDomain.set(dupKey, rowNum);
    let url: string | null = null;
    if (sourceUrl) {
      if (!isValidHttpUrl(sourceUrl)) {
        quarantined.push({ row: rowNum, company, reason: `Invalid source_url "${sourceUrl}". Use a complete http(s) URL with a valid hostname.` });
        return;
      }
      url = sourceUrl;
    }
    let publicationDate: string | null = null;
    if (sourceDate) {
      const d = parseStrictDate(sourceDate);
      if (!d.ok) {
        quarantined.push({ row: rowNum, company, reason: `Invalid source_date "${sourceDate}": ${d.error}` });
        return;
      }
      publicationDate = d.date;
    }

    const hasEvidence = evidenceText.length > 0;
    let scores: Account['scores'] = { fit: 0, intent: 0, engagement: 0, timing: 0 };
    let scoreOrigin: Account['scoreOrigin'] = 'sample';
    const notes: string[] = [];
    if (tags) {
      const parsed = parseTags(tags);
      if (parsed.error) {
        quarantined.push({ row: rowNum, company, reason: parsed.error });
        return;
      }
      if (hasEvidence) {
        scores = parsed.scores;
        scoreOrigin = 'user-asserted';
        notes.push('Supplied scoring tags kept as user assertions, not substantiated facts.');
      } else {
        const hasPositiveScore = Object.values(parsed.scores).some((v) => v > 0);
        if (hasPositiveScore) {
          quarantined.push({ row: rowNum, company, reason: 'Positive score tags require evidence_text. Add evidence or remove the tags.' });
          return;
        }
        notes.push('Supplied scoring tags ignored: no evidence text was provided, so evidence-dependent scores are 0.');
      }
    }
    if (!hasEvidence) {
      notes.push('No evidence text supplied: scored as missing evidence (0) and flagged for review.');
    }

    let quality: EvidenceQuality = 'needs-review';
    if (hasEvidence && url && publicationDate) quality = 'medium';
    else if (hasEvidence) quality = 'low';

    const sourceLine = url
      ? `Imported source: ${url} (published ${publicationDate ?? 'unknown'}; user content imported on ${retrievalDate}, not fetched by the app). User-provided import, unverified.`
      : `No source URL supplied with import (user content imported on ${retrievalDate}). User-provided import, unverified.`;

    imported.push({
      id: `csv-${retrievalDate}-${Date.now().toString(36)}-${i}`,
      company,
      domain,
      employees: 'Unknown',
      industry: 'Unknown',
      headquarters: 'Unknown',
      scores,
      evidenceQuality: quality,
      exclusionReason: null,
      dataset: 'imported',
      scoreOrigin,
      reviewNote: notes.join(' ') || undefined,
      signals: [
        {
          id: `csv-${i}-s1`,
          kind: hasEvidence ? 'fact' : 'unknown',
          label: hasEvidence ? 'Imported evidence (user-provided, unverified)' : 'No evidence text supplied',
          detail: hasEvidence ? evidenceText : notes.join(' '),
          sourceNote: sourceLine,
          provenance: { origin: 'user-import', sourceUrl: url, publicationDate, retrievalDate },
        },
      ],
      reviewState: 'in-review',
    });
  });

  return { imported, quarantined, parseErrors: errors, skippedEmpty };
}
