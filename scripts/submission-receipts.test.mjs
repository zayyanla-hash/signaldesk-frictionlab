import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  acquireLock,
  markUnknownOutcome,
  receiptKey,
  receiptPath,
  recheckLockedRequest,
  recordReceipt,
  readReceipt,
  readUnknownMarker,
  releaseLock,
  submitOnce,
  validateIssueUrl,
} from './submission-receipts.mjs';

// Test-only scratch directory inside the project; removed after the suite.
const SCRATCH = join(dirname(fileURLToPath(import.meta.url)), '.test-scratch-receipts');

const REPO = 'owner/demo-repo';
const TITLE = 'Onboarding friction: Source choice';
const BODY = '# Issue: Source choice\n\nState: approved\n\n## Problem\np\n';
const URL = 'https://github.com/owner/demo-repo/issues/3';

beforeEach(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe('submission receipts', () => {
  it('keys stably on exact repo + title + content, and differs on any change', () => {
    const base = { repo: REPO, title: TITLE, body: BODY };
    expect(receiptKey(base)).toBe(receiptKey({ ...base }));
    expect(receiptKey({ ...base, repo: 'owner/other' })).not.toBe(receiptKey(base));
    expect(receiptKey({ ...base, title: 'Other' })).not.toBe(receiptKey(base));
    expect(receiptKey({ ...base, body: `${BODY}\nmore` })).not.toBe(receiptKey(base));
  });

  it('validates returned issue URLs against the exact repo', () => {
    expect(validateIssueUrl(URL, REPO).ok).toBe(true);
    expect(validateIssueUrl(URL, REPO).issueNumber).toBe(3);
    expect(validateIssueUrl('https://github.com/owner/other/issues/3', REPO).ok).toBe(false);
    expect(validateIssueUrl('https://github.com/owner/demo-repo/pull/3', REPO).ok).toBe(false);
    expect(validateIssueUrl('not-a-url', REPO).ok).toBe(false);
    expect(validateIssueUrl('', REPO).ok).toBe(false);
  });

  it('misses before anything is recorded, then hits after recording', () => {
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    expect(readReceipt({ dir: SCRATCH, key }).status).toBe('missing');
    const r = recordReceipt({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, remoteId: URL, key });
    expect(r.remoteId).toBe(URL);
    expect(existsSync(receiptPath(SCRATCH, key))).toBe(true);
    const hit = readReceipt({ dir: SCRATCH, key });
    expect(hit.status).toBe('ok');
  });

  it('rejects receipts whose remote ID does not match the stored repo', () => {
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    recordReceipt({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, remoteId: 'https://github.com/owner/other/issues/9', key });
    expect(readReceipt({ dir: SCRATCH, key }).status).toBe('corrupt');
    let code = '';
    try {
      submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate: () => URL });
    } catch (e) {
      code = e.code ?? '';
    }
    expect(code).toBe('UNKNOWN_OUTCOME');
  });

  it('reports corrupt receipts instead of silently retriggering a create', () => {
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    writeFileSync(receiptPath(SCRATCH, key), 'not-json{{{', 'utf8');
    expect(readReceipt({ dir: SCRATCH, key }).status).toBe('corrupt');
    let calls = 0;
    let code = '';
    try {
      submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate: () => { calls++; return URL; } });
    } catch (e) {
      code = e.code ?? '';
    }
    expect(code).toBe('UNKNOWN_OUTCOME');
    expect(calls).toBe(0);
  });

  it('keeps pending and marks unknown when the create fails (no blind retry)', () => {
    let calls = 0;
    let code = '';
    try {
      submitOnce({
        dir: SCRATCH,
        repo: REPO,
        title: TITLE,
        body: BODY,
        runCreate: () => {
          calls++;
          throw new Error('mocked gh failure');
        },
      });
    } catch (e) {
      code = e.code ?? '';
    }
    expect(code).toBe('UNKNOWN_OUTCOME');
    expect(calls).toBe(1);
    expect(readReceipt({ dir: SCRATCH, key: receiptKey({ repo: REPO, title: TITLE, body: BODY }) }).status).toBe('missing');
    // Pending survives: lock dir retained, unknown marker written, retry still refuses.
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    expect(existsSync(join(SCRATCH, `${key}.lock`))).toBe(true);
    expect(readUnknownMarker({ dir: SCRATCH, key })).not.toBeNull();
    let code2 = '';
    try {
      submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate: () => URL });
    } catch (e) {
      code2 = e.code ?? '';
    }
    expect(code2).toBe('UNKNOWN_OUTCOME');
  });

  it('keeps pending when the create returns an invalid ID', () => {
    let code = '';
    try {
      submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate: () => 'ok-but-not-a-url' });
    } catch (e) {
      code = e.code ?? '';
    }
    expect(code).toBe('UNKNOWN_OUTCOME');
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    expect(readReceipt({ dir: SCRATCH, key }).status).toBe('missing');
    expect(existsSync(join(SCRATCH, `${key}.lock`))).toBe(true);
  });

  it('rechecks under a held lock: late completions return duplicates, uncertainty refuses', () => {
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    // Contender holds the lock while a sibling completes and releases.
    expect(acquireLock({ dir: SCRATCH, key, repo: REPO }).acquired).toBe(true);
    recordReceipt({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, remoteId: URL, key });
    const done = recheckLockedRequest({ dir: SCRATCH, key, repo: REPO });
    expect(done && done.duplicate).toBe(true);
    expect(done && done.remoteId).toBe(URL);
    releaseLock({ dir: SCRATCH, key });
  });

  it('recheck under lock refuses on newly appeared uncertainty', () => {
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    expect(acquireLock({ dir: SCRATCH, key, repo: REPO }).acquired).toBe(true);
    markUnknownOutcome({ dir: SCRATCH, repo: REPO, title: TITLE, key, reason: 'sibling failed' });
    let code = '';
    try {
      recheckLockedRequest({ dir: SCRATCH, key, repo: REPO });
    } catch (e) {
      code = e.code ?? '';
    }
    expect(code).toBe('UNKNOWN_OUTCOME');
    releaseLock({ dir: SCRATCH, key });
  });

  it('releases the lock only after a validated success', () => {
    const key = receiptKey({ repo: REPO, title: TITLE, body: BODY });
    const r = submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate: () => URL });
    expect(r.duplicate).toBe(false);
    expect(existsSync(join(SCRATCH, `${key}.lock`))).toBe(false);
  });

  it('skips create on repeat and returns the recorded remote ID', () => {
    let calls = 0;
    const runCreate = () => {
      calls++;
      return URL;
    };
    const first = submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate });
    expect(first.duplicate).toBe(false);
    expect(first.remoteId).toBe(URL);
    const second = submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate });
    expect(second.duplicate).toBe(true);
    expect(second.remoteId).toBe(URL);
    expect(calls).toBe(1);
  });

  it('isolates receipts across repos: same content, other repo is not a duplicate', () => {
    let calls = 0;
    const runCreate = () => {
      calls++;
      return URL;
    };
    submitOnce({ dir: SCRATCH, repo: REPO, title: TITLE, body: BODY, runCreate });
    const other = submitOnce({
      dir: SCRATCH,
      repo: 'owner/other-repo',
      title: TITLE,
      body: BODY,
      runCreate: () => {
        calls++;
        return 'https://github.com/owner/other-repo/issues/9';
      },
    });
    expect(other.duplicate).toBe(false);
    expect(calls).toBe(2);
  });
});
