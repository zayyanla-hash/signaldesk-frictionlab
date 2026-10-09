import { describe, expect, it } from 'vitest';
import {
  isAllowlisted,
  isRepoFormatOk,
  resolveMode,
  validateExportRequest,
  validatePreambleApproval,
} from './export-guards.mjs';

const APPROVED_MD = '# Issue: Source choice\n\nState: approved\n\n## Problem\np\n';
const DRAFT_MD = '# Issue: Source choice\n\nState: draft\n\n## Problem\np\n';

describe('export guards', () => {
  it('validates approval at the preamble only and rejects smuggled markers', () => {
    expect(validatePreambleApproval(APPROVED_MD).ok).toBe(true);
    expect(validatePreambleApproval(DRAFT_MD).ok).toBe(false);
    const injected = `${DRAFT_MD}\n## Notes\nSome text\nState: approved\n`;
    expect(validatePreambleApproval(injected).ok).toBe(false);
    const doubled = `# Issue: Source choice\n\nState: approved\nState: approved\n\n## Problem\np\n`;
    expect(validatePreambleApproval(doubled).ok).toBe(false);
    expect(validatePreambleApproval('').ok).toBe(false);
    expect(validatePreambleApproval('State: approved\n\n## Problem\np\n').ok).toBe(false);
    expect(validatePreambleApproval('# Issue:   \n\nState: approved\n\n## Problem\np\n').ok).toBe(false);
  });

  it('matches the allowlist exactly and fails closed otherwise', () => {
    expect(isAllowlisted('owner/demo-repo', 'owner/demo-repo')).toBe(true);
    expect(isAllowlisted('owner/other', 'owner/demo-repo')).toBe(false);
    expect(isAllowlisted('owner/demo-repo', '')).toBe(false);
    expect(isAllowlisted('', 'owner/demo-repo')).toBe(false);
    expect(isAllowlisted(' Owner/demo-repo ', 'owner/demo-repo')).toBe(false);
  });

  it('validates repo format', () => {
    expect(isRepoFormatOk('owner/demo-repo')).toBe(true);
    expect(isRepoFormatOk('not a repo')).toBe(false);
    expect(isRepoFormatOk('')).toBe(false);
  });

  it('keeps dry-run read-only: only explicit --live resolves to live', () => {
    expect(resolveMode({ live: true, dryRun: false })).toBe('live');
    expect(resolveMode({ live: false, dryRun: false })).toBe('dry-run');
    expect(resolveMode({ live: true, dryRun: true })).toBe('dry-run');
    expect(resolveMode({ live: false, dryRun: true })).toBe('dry-run');
  });

  it('accepts a fully guarded live request', () => {
    const r = validateExportRequest({
      repo: 'owner/demo-repo',
      allowlist: 'owner/demo-repo',
      markdown: APPROVED_MD,
      live: true,
      dryRun: false,
    });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('live');
    expect(r.errors).toEqual([]);
  });

  it('rejects live write on mismatching allowlist', () => {
    const r = validateExportRequest({
      repo: 'attacker/repo',
      allowlist: 'owner/demo-repo',
      markdown: APPROVED_MD,
      live: true,
      dryRun: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/allowlist/);
  });

  it('rejects live write without a configured allowlist', () => {
    const r = validateExportRequest({
      repo: 'owner/demo-repo',
      allowlist: '',
      markdown: APPROVED_MD,
      live: true,
      dryRun: false,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects unapproved content even with matching allowlist and --live', () => {
    const r = validateExportRequest({
      repo: 'owner/demo-repo',
      allowlist: 'owner/demo-repo',
      markdown: DRAFT_MD,
      live: true,
      dryRun: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/approved/);
  });

  it('rejects live write without --live (dry-run stays read-only)', () => {
    const r = validateExportRequest({
      repo: 'owner/demo-repo',
      allowlist: 'owner/demo-repo',
      markdown: APPROVED_MD,
      live: false,
      dryRun: false,
    });
    expect(r.ok).toBe(false);
    expect(r.mode).toBe('dry-run');
  });
});
