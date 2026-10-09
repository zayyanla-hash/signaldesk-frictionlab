import { describe, expect, it } from 'vitest';
import { validateSignalCSV } from './csvImport';
import { approvedToCSV, briefToMarkdown, eligibleExportAccounts } from './export';
import { DEFAULT_CRITERIA, SAMPLE_ACCOUNTS } from './sampleData';
import { scoreAccount } from './scoring';
import { DEFAULT_WEIGHTS } from './types';

const HEADER = 'company,domain,source_url,source_date,evidence_text,tags';

describe('import URL and date validation', () => {
  it('quarantines bare-prefix URLs and impossible dates', () => {
    const r = validateSignalCSV(`${HEADER}\nAudit,audit.example,https://,2025-99-99,evidence,fit:50`);
    expect(r.imported).toHaveLength(0);
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0].reason).toMatch(/source_url|Invalid/i);
  });

  it('rejects domains carrying paths, ports, or schemes', () => {
    for (const domain of ['good.example/path', 'good.example:8080', 'https://good.example']) {
      const r = validateSignalCSV(`${HEADER}\nA,${domain},,2025-03-01,evidence,`);
      expect(r.imported).toHaveLength(0);
      expect(r.quarantined[0].reason).toMatch(/Invalid domain/);
    }
  });

  it('quarantines rolled-over dates while accepting leap days', () => {
    const bad = validateSignalCSV(`${HEADER}\nA,a.example,,2025-02-30,evidence,`);
    expect(bad.imported).toHaveLength(0);
    const leap = validateSignalCSV(`${HEADER}\nA,a.example,,2024-02-29,evidence,`);
    expect(leap.imported).toHaveLength(1);
    expect(leap.imported[0].signals[0].provenance.publicationDate).toBe('2024-02-29');
  });

  it('keeps unknown publication dates unknown and stamps retrieval', () => {
    const r = validateSignalCSV(`${HEADER}\nA,a.example,,,some evidence,`);
    expect(r.imported).toHaveLength(1);
    const p = r.imported[0].signals[0].provenance;
    expect(p.origin).toBe('user-import');
    expect(p.publicationDate).toBeNull();
    expect(p.sourceUrl).toBeNull();
    expect(p.retrievalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.imported[0].evidenceQuality).toBe('low');
  });
});

describe('missing evidence and user assertions', () => {
  it('quarantines positive score tags supplied without evidence text', () => {
    const r = validateSignalCSV(`${HEADER}\nNo evidence,no-evidence.example,,,,fit:100;intent:100;engagement:100;timing:100`);
    expect(r.imported).toHaveLength(0);
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0].reason).toMatch(/require evidence_text/i);
  });

  it('imports with zero scores when tags and evidence are both absent', () => {
    const r = validateSignalCSV(`${HEADER}\nNo evidence,no-evidence.example,,,,`);
    expect(r.imported).toHaveLength(1);
    const a = r.imported[0];
    const s = scoreAccount(a, DEFAULT_WEIGHTS);
    expect(s.total).toBe(0);
    expect(a.reviewNote).toMatch(/missing evidence/i);
    expect(a.reviewState).toBe('in-review');
  });

  it('marks supplied tags as user assertions, never validated facts', () => {
    const r = validateSignalCSV(`${HEADER}\nA,a.example,,2025-03-01,real note,fit:80`);
    expect(r.imported[0].scoreOrigin).toBe('user-asserted');
    expect(r.imported[0].signals[0].provenance.origin).toBe('user-import');
  });
});

describe('criteria-aware exports', () => {
  it('excludes hard-excluded accounts from the approved CSV', () => {
    const accounts = SAMPLE_ACCOUNTS.map((a) =>
      a.id === 'a01' ? { ...a, reviewState: 'approved' as const } : a
    );
    const csv = approvedToCSV(accounts, DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    expect(csv).toMatch(/Northloop/);
    const criteria = { ...DEFAULT_CRITERIA, excludedDomains: ['northloop.example'] };
    const csv2 = approvedToCSV(accounts, DEFAULT_WEIGHTS, criteria);
    expect(csv2).not.toMatch(/Northloop/);
    const { eligible, approvedExcluded } = eligibleExportAccounts(accounts, DEFAULT_WEIGHTS, criteria);
    expect(eligible).toHaveLength(0);
    expect(approvedExcluded.map((a) => a.company)).toEqual(['Northloop Systems']);
  });

  it('carries criteria, exclusion status, and provenance into brief Markdown', () => {
    const md = briefToMarkdown(SAMPLE_ACCOUNTS[0], DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    expect(md).toMatch(/Target criteria/);
    expect(md).toMatch(/Excluded: no/);
    expect(md).toMatch(/synthetic sample/i);
    const imported = validateSignalCSV(`${HEADER}\nA,a.example,https://a.example/p,2025-03-01,note,`);
    const md2 = briefToMarkdown(imported.imported[0], DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    expect(md2).toMatch(/user-provided import, unverified/);
    expect(md2).toMatch(/published 2025-03-01/);
  });
});
