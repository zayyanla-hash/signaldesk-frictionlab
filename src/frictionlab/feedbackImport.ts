import { parseStrictTimestamp } from '../lib/datetime';
import { parseCSVTable } from '../lib/csv';
import { SNAPSHOT_ISO, type FeedbackRecord } from './types';

export interface FeedbackImportResult {
  records: FeedbackRecord[];
  quarantined: { row: number; feedback_id: string; reason: string }[];
  parseErrors: string[];
  skippedEmpty: number;
}

const EXPECTED = ['feedback_id', 'account_id', 'text', 'received_at'];

/**
 * Validate a fixed-schema feedback.csv import. Imported records are labeled
 * user-provided and unverified: they count as evidence only after review,
 * never as validated facts. Nothing is truncated silently.
 */
export function validateFeedbackCSV(
  text: string,
  opts: { knownAccountIds: Set<string>; existingIds?: Set<string>; snapshotISO?: string }
): FeedbackImportResult {
  const { header, rows, rowStarts, errors, skippedEmpty } = parseCSVTable(text);
  const quarantined: FeedbackImportResult['quarantined'] = [];
  const records: FeedbackRecord[] = [];
  const snapshot = Date.parse(opts.snapshotISO ?? SNAPSHOT_ISO);
  const seen = new Set<string>(opts.existingIds ?? []);

  const missing = EXPECTED.filter((e) => !header.includes(e));
  if (missing.length > 0) {
    return {
      records: [],
      quarantined: [],
      parseErrors: [
        ...errors,
        `Header missing required columns: ${missing.join(', ')}. Expected: ${EXPECTED.join(', ')}`,
      ],
      skippedEmpty,
    };
  }

  rows.forEach((r, i) => {
    const row = rowStarts[i] ?? i + 2;
    const feedback_id = (r['feedback_id'] ?? '').trim();
    const account_id = (r['account_id'] ?? '').trim();
    const message = (r['text'] ?? '').trim();
    const received_at = (r['received_at'] ?? '').trim();

    if (!feedback_id && !account_id && !message && !received_at) {
      return; // counted in skippedEmpty by the table parser when truly blank
    }
    const tag = feedback_id || '(blank id)';
    if (!feedback_id || !account_id || !message || !received_at) {
      quarantined.push({ row, feedback_id: tag, reason: 'Missing required field (feedback_id, account_id, text, received_at).' });
      return;
    }
    if (seen.has(feedback_id)) {
      quarantined.push({ row, feedback_id, reason: `Duplicate feedback_id "${feedback_id}" (conflicts with an existing record).` });
      return;
    }
    const t = parseStrictTimestamp(received_at);
    if (!t.ok) {
      quarantined.push({ row, feedback_id, reason: `Bad received_at: ${t.error}` });
      return;
    }
    if (t.ms > snapshot) {
      quarantined.push({ row, feedback_id, reason: 'received_at is after the snapshot cutoff (future record).' });
      return;
    }
    if (!opts.knownAccountIds.has(account_id)) {
      quarantined.push({ row, feedback_id, reason: `Unjoinable account "${account_id}": no events for this account in the current dataset.` });
      return;
    }
    seen.add(feedback_id);
    records.push({ feedback_id, account_id, text: message, received_at: t.iso, origin: 'user-provided' });
  });

  return { records, quarantined, parseErrors: errors, skippedEmpty };
}
