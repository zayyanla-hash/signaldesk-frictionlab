import { parseCSVTable } from '../lib/csv';
import { blankEvidence, evidenceErrors, MAX_EVIDENCE, MAX_IMPORT_BYTES, newId, today, type Criterion, type EvidenceRecord, type ResearchAccount, reviseAccount } from './researchModel';

export interface ImportPreview { records: EvidenceRecord[]; errors: string[]; warnings: string[]; }
export const IMPORT_COLUMNS = 'criterion,claim,source_url,source_title,publication_date,retrieval_date,excerpt,kind,stance,note';
const fields = ['criterion', 'claim', 'excerpt', 'sourceTitle', 'sourceUrl', 'publicationDate', 'retrievalDate', 'kind', 'stance', 'note'] as const;
const aliases: Record<string, string> = { source_url: 'sourceUrl', source_title: 'sourceTitle', publication_date: 'publicationDate', retrieval_date: 'retrievalDate', evidence_text: 'excerpt', source_date: 'publicationDate' };
function normalizeRow(value: unknown, index: number): { evidence?: EvidenceRecord; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: [`Row ${index}: expected an evidence object.`] };
  const row: Record<string, unknown> = Object.create(null);
  for (const [key, v] of Object.entries(value)) row[aliases[key] ?? key] = v;
  const e: Record<string, unknown> = { ...blankEvidence(), id: newId(), verification: 'unverified' };
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(row, key)) e[key] = row[key];
  // Imports never inherit an asserted verification status or a source retrieval timestamp.
  // Dates may be supplied, but only an explicit human review can verify the source.
  e.publicationDate = e.publicationDate === '' ? null : e.publicationDate;
  e.retrievalDate = e.retrievalDate === '' ? null : e.retrievalDate;
  const errors = evidenceErrors(e).map(s => `Row ${index}: ${s}`);
  return errors.length ? { errors } : { evidence: e as unknown as EvidenceRecord, errors: [] };
}
export function evidenceFingerprint(e: EvidenceRecord): string {
  return [e.criterion, e.kind, e.stance, e.claim.trim().toLowerCase(), e.sourceUrl.trim(), e.excerpt.trim()].join('\u001f');
}
export function parseEvidenceImport(input: string, format: 'json' | 'csv', existing: EvidenceRecord[] = []): ImportPreview {
  const result: ImportPreview = { records: [], errors: [], warnings: ['Imported claims are unverified. Open each source and check the excerpt before verification.'] };
  if (new TextEncoder().encode(input).length > MAX_IMPORT_BYTES) return { ...result, errors: ['File exceeds 1 MB. Split the file; nothing has been imported.'] };
  let rows: unknown[];
  let rowStarts: number[] = [];
  if (format === 'json') {
    try {
      const parsed: unknown = JSON.parse(input.replace(/^\uFEFF/, ''));
      if (Array.isArray(parsed)) rows = parsed;
      else if (parsed && typeof parsed === 'object' && 'evidence' in parsed && Array.isArray((parsed as { evidence: unknown }).evidence)) rows = (parsed as { evidence: unknown[] }).evidence;
      else return { ...result, errors: ['Expected a JSON array of evidence or an object with an evidence array. Use Restore backup for whole workspaces.'] };
    } catch { return { ...result, errors: ['Invalid JSON. Check commas, quotation marks, and brackets. Nothing has been imported.'] }; }
  } else {
    const parsed = parseCSVTable(input);
    result.errors.push(...parsed.errors);
    if (!['claim', 'criterion'].every(h => parsed.header.includes(h))) return { ...result, errors: [...result.errors, 'CSV requires claim and criterion headers. Download the template.'] };
    rows = parsed.rows;
    rowStarts = parsed.rowStarts;
  }
  if (!rows.length && !result.errors.length) result.errors.push('No evidence records found.');
  if (rows.length + existing.length > MAX_EVIDENCE) return { ...result, errors: [`This would exceed ${MAX_EVIDENCE} evidence records per account. Nothing has been imported.`] };
  const seen = new Set(existing.map(evidenceFingerprint));
  rows.forEach((row, i) => {
    const normalized = normalizeRow(row, rowStarts[i] ?? i + 1);
    result.errors.push(...normalized.errors);
    if (!normalized.evidence) return;
    const fingerprint = evidenceFingerprint(normalized.evidence);
    if (seen.has(fingerprint)) { result.errors.push(`Row ${rowStarts[i] ?? i + 1}: duplicate evidence skipped.`); return; }
    seen.add(fingerprint);
    result.records.push(normalized.evidence);
  });
  return result;
}
export function captureSource(input: { url: string; title: string; excerpt: string; claim: string; criterion: Criterion; publicationDate: string; retrievalDate: string }, existing: EvidenceRecord[] = []): ImportPreview {
  const e: EvidenceRecord = {
    ...blankEvidence(input.criterion), sourceUrl: input.url.trim(), sourceTitle: input.title.trim(), excerpt: input.excerpt.trim(), claim: input.claim.trim() || (input.excerpt.trim() ? 'Review this excerpt and write a precise claim.' : 'Source queued: open the URL and capture evidence.'),
    publicationDate: input.publicationDate || null, retrievalDate: input.excerpt.trim() ? input.retrievalDate || null : null,
    kind: input.excerpt.trim() && input.claim.trim() ? 'fact' : 'unknown',
    stance: input.excerpt.trim() && input.claim.trim() ? 'supports' : 'neutral',
  };
  const errors = evidenceErrors(e);
  if (!e.sourceUrl && !e.excerpt) errors.push('Add a source URL or paste source text.');
  if (existing.length >= MAX_EVIDENCE) errors.push(`Account has reached ${MAX_EVIDENCE} evidence records.`);
  if (existing.some(x => evidenceFingerprint(x) === evidenceFingerprint(e))) errors.push('This evidence already exists.');
  return { records: errors.length ? [] : [e], errors, warnings: [e.kind === 'unknown' ? 'URL saved as a research task. No page was fetched and no fact is asserted.' : 'Assisted capture only. Text is stored as untrusted data. Verify the original source before qualification.'] };
}
export function mergeEvidence(account: ResearchAccount, incoming: EvidenceRecord[]): ResearchAccount {
  const seen = new Set(account.evidence.map(evidenceFingerprint));
  const unique = incoming.filter(e => { const key = evidenceFingerprint(e); if (seen.has(key)) return false; seen.add(key); return true; });
  if (account.evidence.length + unique.length > MAX_EVIDENCE) throw new Error(`Maximum ${MAX_EVIDENCE} evidence records per account.`);
  return reviseAccount(account, { evidence: [...account.evidence, ...unique] });
}
export function templateCSV(): string {
  return `${IMPORT_COLUMNS}\nproduct,"Describe a specific B2B software capability",https://company.example/product,Product page,,${today()},"Paste the exact source excerpt",fact,supports,"Check the source before verifying"\n`;
}
