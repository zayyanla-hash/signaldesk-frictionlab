/**
 * Record-level CSV parsing (RFC 4180 style).
 * - Handles quoted multiline fields, escaped ("") quotes, CRLF, and BOM.
 * - Never splits physical lines before quote processing.
 * - Reports duplicate headers (after case normalization), row-width mismatches,
 *   unterminated and misplaced quotes with physical row numbers.
 * - Bounds input size and record count with an explicit rejection (no truncation).
 */

export interface CSVRecord {
  fields: string[];
  quoted: boolean[];
  startRow: number;
  endRow: number;
}

export interface CSVRecordsResult {
  records: CSVRecord[];
  errors: string[];
  blankLines: number;
}

export interface CSVTableResult {
  header: string[];
  rows: Record<string, string>[];
  /** Physical start row for each entry of rows (multiline fields shift i+2 indexing). */
  rowStarts: number[];
  errors: string[];
  skippedEmpty: number;
}

export const CSV_MAX_BYTES = 1_000_000;
export const CSV_MAX_RECORDS = 20_000;

export function parseCSVRecords(
  text: string,
  opts?: { maxBytes?: number; maxRows?: number }
): CSVRecordsResult {
  const maxBytes = opts?.maxBytes ?? CSV_MAX_BYTES;
  const maxRows = opts?.maxRows ?? CSV_MAX_RECORDS;
  const errors: string[] = [];
  if (text.length > maxBytes) {
    return {
      records: [],
      blankLines: 0,
      errors: [
        `Input too large (${text.length} characters; limit ${maxBytes}). Split the file and import in parts. Nothing was imported.`,
      ],
    };
  }
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  const records: CSVRecord[] = [];
  let fields: string[] = [];
  let quotedFlags: boolean[] = [];
  let cur = '';
  let curQuoted = false;
  let fieldHasContent = false; // any char (incl. quote markers) seen in current field
  let inQuotes = false;
  // After a closing quote only a delimiter, newline, or EOF may follow.
  // Anything else (e.g. `"hello"oops`) is malformed, never concatenated.
  let justClosedQuote = false;
  let recordStartRow = 1;
  let row = 1;
  let recordHasContent = false;
  let aborted = false;
  let blankLines = 0;

  const finishField = () => {
    fields.push(curQuoted ? cur : cur.trim());
    quotedFlags.push(curQuoted);
    cur = '';
    curQuoted = false;
    fieldHasContent = false;
    justClosedQuote = false;
  };
  const finishRecord = (endRow: number) => {
    finishField();
    records.push({ fields, quoted: quotedFlags, startRow: recordStartRow, endRow });
    if (records.length > maxRows) {
      errors.push(
        `Too many records (limit ${maxRows}). Split the file and import in parts. Nothing was imported.`
      );
      aborted = true;
    }
    fields = [];
    quotedFlags = [];
    recordHasContent = false;
    recordStartRow = endRow + 1;
  };

  const failRecord = (msg: string, endRow: number) => {
    errors.push(`Record starting at physical row ${recordStartRow}: ${msg} This record was skipped.`);
    // resync: skip to end of the physical line
    fields = [];
    quotedFlags = [];
    cur = '';
    curQuoted = false;
    fieldHasContent = false;
    justClosedQuote = false;
    inQuotes = false;
    recordHasContent = false;
    recordStartRow = endRow + 1;
  };

  let i = 0;
  const n = src.length;
  while (i < n && !aborted) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        justClosedQuote = true;
        i++;
        continue;
      }
      if (ch === '\r' && src[i + 1] === '\n') {
        cur += '\r\n';
        row++;
        i += 2;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        cur += ch === '\r' ? '\r\n' : '\n';
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row++;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    // not in quotes
    if (justClosedQuote) {
      if (ch === ',' || ch === '\n' || ch === '\r') {
        justClosedQuote = false;
      } else {
        failRecord('text after a closing quote; only a delimiter or newline may follow a quoted field.', row);
        // skip to end of physical line
        while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
        continue;
      }
    }
    if (ch === '"') {
      if (!fieldHasContent) {
        inQuotes = true;
        curQuoted = true;
        fieldHasContent = true;
        recordHasContent = true;
        i++;
        continue;
      }
      failRecord('misplaced quote inside an unquoted field.', row);
      // skip to end of physical line
      while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }
    if (ch === ',') {
      recordHasContent = true;
      finishField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      const endRow = row;
      if (ch === '\r' && src[i + 1] === '\n') {
        i += 2;
      } else {
        i++;
      }
      row++;
      if (!recordHasContent && fields.length === 0) {
        // blank physical line: not a record; counted so imports can report it
        blankLines++;
        recordStartRow = row;
        continue;
      }
      finishRecord(endRow);
      if (aborted) {
        return { records: [], blankLines: 0, errors };
      }
      continue;
    }
    cur += ch;
    fieldHasContent = true;
    recordHasContent = true;
    i++;
  }
  if (aborted) return { records: [], blankLines: 0, errors };
  if (inQuotes) {
    errors.push(
      `Record starting at physical row ${recordStartRow}: unterminated quoted field. This record was skipped.`
    );
  } else if (recordHasContent || fields.length > 0) {
    finishRecord(row);
  }
  return { records, errors, blankLines };
}

/** Normalize a header cell: trim + lowercase. */
export function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase();
}

/**
 * Map records to row objects against the first record as header.
 * All parse problems are surfaced in `errors`; only valid records become rows.
 */
export function parseCSVTable(text: string): CSVTableResult {
  const { records, errors, blankLines } = parseCSVRecords(text);
  const outErrors = [...errors];
  if (records.length === 0) {
    if (outErrors.length === 0) outErrors.push('Empty file: no header row found.');
    return { header: [], rows: [], rowStarts: [], errors: outErrors, skippedEmpty: blankLines };
  }
  const rawHeader = records[0].fields;
  const header = rawHeader.map(normalizeHeaderCell);
  // Header problems reject the whole table; record problems only skip records.
  const headerErrors: string[] = [];
  const seen = new Map<string, number>();
  header.forEach((h, idx) => {
    if (!h) {
      headerErrors.push(`Header column ${idx + 1} is empty. Nothing was imported.`);
    } else if (seen.has(h)) {
      headerErrors.push(
        `Duplicate header "${h}" (columns ${seen.get(h)! + 1} and ${idx + 1} after case normalization). Nothing was imported.`
      );
    } else {
      seen.set(h, idx);
    }
  });
  if (headerErrors.length > 0) {
    return { header: [], rows: [], rowStarts: [], errors: [...outErrors, ...headerErrors], skippedEmpty: 0 };
  }

  const rows: Record<string, string>[] = [];
  const rowStarts: number[] = [];
  let skippedEmpty = blankLines;
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.fields.length === 1 && rec.fields[0] === '' && !rec.quoted[0]) {
      skippedEmpty++;
      continue;
    }
    if (rec.fields.length !== header.length) {
      outErrors.push(
        `Record starting at physical row ${rec.startRow}: expected ${header.length} columns, found ${rec.fields.length}. This record was skipped.`
      );
      continue;
    }
    // Null-prototype objects: a header cell like __proto__ must stay data,
    // never a prototype setter.
    const obj: Record<string, string> = Object.create(null);
    header.forEach((h, idx) => {
      obj[h] = rec.fields[idx];
    });
    rows.push(obj);
    rowStarts.push(rec.startRow);
  }
  return { header, rows, rowStarts, errors: outErrors, skippedEmpty };
}
