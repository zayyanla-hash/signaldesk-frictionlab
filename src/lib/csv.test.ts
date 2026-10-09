import { describe, expect, it } from 'vitest';
import { parseCSVRecords, parseCSVTable } from './csv';
import { csvSafe, toCSV } from './utils';

describe('record-level CSV parsing', () => {
  it('round-trips a quoted multiline field as one record', () => {
    const text = toCSV([
      ['company', 'evidence'],
      ['Audit Example', 'line1\nline2'],
    ]);
    const t = parseCSVTable(text);
    expect(t.errors).toEqual([]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ company: 'Audit Example', evidence: 'line1\nline2' });
  });

  it('handles escaped quotes and CRLF/BOM', () => {
    const t = parseCSVTable('\uFEFFcompany,evidence\r\nAcme,"said ""hi"" loudly"\r\n');
    expect(t.errors).toEqual([]);
    expect(t.rows[0].evidence).toBe('said "hi" loudly');
  });

  it('rejects unterminated quotes with a physical row number', () => {
    const t = parseCSVTable('company,evidence\nAcme,"unfinished\n');
    expect(t.rows).toHaveLength(0);
    expect(t.errors.join(' ')).toMatch(/row 2/i);
    expect(t.errors.join(' ')).toMatch(/unterminated/i);
  });

  it('rejects misplaced quotes instead of silently accepting them', () => {
    const t = parseCSVTable('company,evidence\nAcme,ab"cd"\nOk,fine\n');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].company).toBe('Ok');
    expect(t.errors.join(' ')).toMatch(/misplaced/i);
  });

  it('rejects duplicate headers after case normalization', () => {
    const t = parseCSVTable('Company,company\nAcme,Acme\n');
    expect(t.rows).toHaveLength(0);
    expect(t.errors.join(' ')).toMatch(/duplicate header/i);
  });

  it('rejects rows with the wrong width and keeps valid rows', () => {
    const t = parseCSVTable('a,b\n1,2,3\n4,5\n');
    expect(t.rows).toEqual([{ a: '4', b: '5' }]);
    expect(t.errors.join(' ')).toMatch(/expected 2 columns, found 3/);
  });

  it('rejects text after a closing quote instead of concatenating', () => {
    const t = parseCSVTable('a,b\n"hello"oops,2\nok,fine\n');
    expect(t.rows).toEqual([{ a: 'ok', b: 'fine' }]);
    expect(t.errors.join(' ')).toMatch(/closing quote/i);
  });

  it('rejects repeated misplaced quotes with physical row numbers', () => {
    const t = parseCSVTable('a,b\nx,ab"cd"ef"gh"\n1,2\n');
    expect(t.rows).toEqual([{ a: '1', b: '2' }]);
    expect(t.errors.join(' ')).toMatch(/row 2/i);
  });

  it('keeps __proto__ headers as data, not prototype setters', () => {
    const t = parseCSVTable('__proto__,b\npolluted,2\n');
    expect(t.rows).toHaveLength(1);
    expect(Object.getPrototypeOf(t.rows[0])).toBeNull();
    expect(t.rows[0]['__proto__' as string]).toBe('polluted');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('carries physical record row numbers for multiline fields', () => {
    const t = parseCSVTable('a,b\n"x\ny",2\nz,3\n');
    expect(t.rowStarts).toEqual([2, 4]);
    expect(t.rows[0]).toMatchObject({ a: 'x\ny' });
  });

  it('counts skipped blank lines instead of dropping them silently', () => {
    const t = parseCSVTable('a,b\n1,2\n\n3,4\n');
    expect(t.rows).toHaveLength(2);
    expect(t.skippedEmpty).toBe(1);
  });

  it('rejects oversized input explicitly with nothing imported', () => {
    const big = `a,b\n${'x,'.repeat(100)}`;
    const r = parseCSVRecords(big, { maxBytes: 10 });
    expect(r.records).toHaveLength(0);
    expect(r.errors.join(' ')).toMatch(/too large/i);
  });

  it('normalizes header case for lookups', () => {
    const t = parseCSVTable('Company,DOMAIN\nAcme,acme.example\n');
    expect(t.header).toEqual(['company', 'domain']);
    expect(t.rows[0]).toEqual({ company: 'Acme', domain: 'acme.example' });
  });
});

describe('formula guard hardening', () => {
  it('prefixes leading-whitespace and control-character bypasses', () => {
    expect(csvSafe(' =cmd(1)')).toBe("' =cmd(1)");
    expect(csvSafe('\t@evil')).toBe("'\t@evil");
    expect(csvSafe('a\x07b')).toBe("'a\x07b");
  });

  it('leaves ordinary text and quoted content intact', () => {
    expect(csvSafe('a,b')).toBe('a,b');
    const csv = toCSV([
      ['a', 'b'],
      ['x', 'line1\nline2'],
    ]);
    const t = parseCSVTable(csv);
    expect(t.errors).toEqual([]);
    expect(t.rows[0]).toMatchObject({ a: 'x', b: 'line1\nline2' });
  });
});
