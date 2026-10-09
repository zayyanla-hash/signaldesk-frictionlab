import { describe, expect, it } from 'vitest';
import { verifyOwnership } from './repo-ownership.mjs';

const GOOD_INFO = {
  full_name: 'owner/demo-repo',
  owner: { login: 'owner', type: 'User' },
  permissions: { push: true, admin: false },
  has_issues: true,
  archived: false,
  disabled: false,
};

describe('repo ownership verification', () => {
  it('accepts a personal user-owned repo with push access and open issues', () => {
    expect(verifyOwnership({ repo: 'owner/demo-repo', authLogin: 'owner', repoInfo: GOOD_INFO }).ok).toBe(true);
  });

  it('rejects owner mismatch, orgs, and missing write access', () => {
    expect(
      verifyOwnership({ repo: 'owner/demo-repo', authLogin: 'someone-else', repoInfo: GOOD_INFO }).errors.map((e) => e.code)
    ).toContain('NOT_OWNER');
    expect(
      verifyOwnership({
        repo: 'owner/demo-repo',
        authLogin: 'owner',
        repoInfo: { ...GOOD_INFO, owner: { login: 'owner', type: 'Organization' } },
      }).errors.map((e) => e.code)
    ).toContain('NOT_PERSONAL');
    expect(
      verifyOwnership({
        repo: 'owner/demo-repo',
        authLogin: 'owner',
        repoInfo: { ...GOOD_INFO, permissions: { push: false, admin: false } },
      }).errors.map((e) => e.code)
    ).toContain('NO_WRITE_ACCESS');
  });

  it('rejects archived, disabled, issues-off, and canonical-name mismatch', () => {
    const codes = (info) =>
      verifyOwnership({ repo: 'owner/demo-repo', authLogin: 'owner', repoInfo: info }).errors.map((e) => e.code);
    expect(codes({ ...GOOD_INFO, archived: true })).toContain('ARCHIVED');
    expect(codes({ ...GOOD_INFO, disabled: true })).toContain('DISABLED');
    expect(codes({ ...GOOD_INFO, has_issues: false })).toContain('ISSUES_DISABLED');
    expect(codes({ ...GOOD_INFO, full_name: 'owner/other' })).toContain('NOT_FOUND');
    expect(codes(null)).toContain('NOT_FOUND');
    expect(verifyOwnership({ repo: 'not a repo', authLogin: 'owner', repoInfo: GOOD_INFO }).errors[0].code).toBe('BAD_FORMAT');
  });

  it('fails closed when safety metadata is missing', () => {
    const { has_issues, archived, disabled, ...rest } = GOOD_INFO;
    void has_issues;
    void archived;
    void disabled;
    const codes = verifyOwnership({ repo: 'owner/demo-repo', authLogin: 'owner', repoInfo: rest }).errors.map((e) => e.code);
    expect(codes).toContain('INCOMPLETE_METADATA');
    expect(verifyOwnership({ repo: 'owner/demo-repo', authLogin: 'owner', repoInfo: rest }).ok).toBe(false);
  });
});
