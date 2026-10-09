import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Project-local scratch for CLI integration runs; removed after the suite.
const SCRATCH = join(dirname(fileURLToPath(import.meta.url)), '..', '.test-scratch-cli');
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-gh.mjs');
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'github-issue.mjs');

const HANDOFF = [
  '# Issue: Source choice',
  '',
  'State: approved',
  '',
  '## Problem',
  'Source choice',
  '',
  '## Supporting evidence',
  'Linked record f-001.',
  '',
].join('\n');

function setup(extraEnv = {}) {
  const dir = join(SCRATCH, `run-${Math.random().toString(36).slice(2)}`);
  const bin = join(dir, 'bin');
  const receipts = join(dir, 'receipts');
  mkdirSync(bin, { recursive: true });
  mkdirSync(receipts, { recursive: true });
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec node "${FIXTURE}" "$@"\n`, 'utf8');
  chmodSync(join(bin, 'gh'), 0o755);
  const handoff = join(dir, 'handoff.md');
  writeFileSync(handoff, HANDOFF, 'utf8');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    PORTFOLIO_DEMO_REPO: 'owner/demo-repo',
    PORTFOLIO_RECEIPT_DIR: receipts,
    FAKE_GH_LOG: join(dir, 'gh-log.jsonl'),
    ...extraEnv,
  };
  delete env.FAKE_GH_LOGIN;
  delete env.FAKE_GH_REPO_JSON;
  delete env.FAKE_GH_CREATE;
  Object.assign(env, extraEnv);
  return { dir, bin, receipts, handoff, env, log: env.FAKE_GH_LOG };
}

function runCLI(ctx, args) {
  try {
    const stdout = execFileSync('node', [CLI, '--repo', 'owner/demo-repo', '--file', ctx.handoff, ...args], {
      encoding: 'utf8',
      env: ctx.env,
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function runCLIAsync(ctx, args) {
  return new Promise((resolve) => {
    execFile('node', [CLI, '--repo', 'owner/demo-repo', '--file', ctx.handoff, ...args], { encoding: 'utf8', env: ctx.env }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

function creates(ctx) {
  if (!existsSync(ctx.log)) return [];
  return readFileSync(ctx.log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.args && e.args[0] === 'issue' && Object.prototype.hasOwnProperty.call(e, 'body'));
}

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe('live CLI with fake gh (no real network)', () => {
  it('dry-run never invokes gh', () => {
    const ctx = setup();
    const r = runCLI(ctx, ['--dry-run']);
    expect(r.code).toBe(0);
    expect(existsSync(ctx.log)).toBe(false);
  });

  it('dry-run wins over --live and never invokes gh', () => {
    const ctx = setup();
    const r = runCLI(ctx, ['--live', '--dry-run']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).mode).toBe('dry-run');
    expect(existsSync(ctx.log)).toBe(false);
  });

  it('refuses unapproved content without invoking gh', () => {
    const ctx = setup();
    writeFileSync(ctx.handoff, '# Issue: X\n\nState: draft\n\n## Problem\nX\n', 'utf8');
    const r = runCLI(ctx, ['--live']);
    expect(r.code).toBe(2);
    expect(existsSync(ctx.log)).toBe(false);
  });

  it('refuses owner mismatch without creating', () => {
    const ctx = setup({ FAKE_GH_LOGIN: 'someone-else' });
    const r = runCLI(ctx, ['--live']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/NOT_OWNER/);
    expect(creates(ctx)).toHaveLength(0);
  });

  it('refuses archived repos and incomplete metadata without creating', () => {
    const archived = setup({
      FAKE_GH_REPO_JSON: JSON.stringify({
        full_name: 'owner/demo-repo',
        owner: { login: 'owner', type: 'User' },
        permissions: { push: true },
        has_issues: true,
        archived: true,
        disabled: false,
      }),
    });
    const r1 = runCLI(archived, ['--live']);
    expect(r1.code).toBe(1);
    expect(r1.stderr).toMatch(/ARCHIVED/);
    expect(creates(archived)).toHaveLength(0);

    const thin = setup({ FAKE_GH_REPO_JSON: JSON.stringify({ full_name: 'owner/demo-repo', owner: { login: 'owner', type: 'User' } }) });
    const r2 = runCLI(thin, ['--live']);
    expect(r2.code).toBe(1);
    expect(r2.stderr).toMatch(/INCOMPLETE_METADATA|NO_WRITE_ACCESS/);
    expect(creates(thin)).toHaveLength(0);
  });

  it('creates once, snapshots the exact body, and repeats without gh', () => {
    const ctx = setup();
    const first = runCLI(ctx, ['--live']);
    expect(first.code).toBe(0);
    const out = JSON.parse(first.stdout);
    expect(out.remoteId).toBe('https://github.com/owner/demo-repo/issues/7');
    expect(out.duplicate).toBe(false);
    const made = creates(ctx);
    expect(made).toHaveLength(1);
    expect(made[0].body).toBe(readFileSync(ctx.handoff, 'utf8'));

    const second = runCLI(ctx, ['--live']);
    expect(second.code).toBe(0);
    expect(JSON.parse(second.stdout).duplicate).toBe(true);
    expect(JSON.parse(second.stdout).remoteId).toBe('https://github.com/owner/demo-repo/issues/7');
    expect(creates(ctx)).toHaveLength(1);
  });

  it('two concurrent identical requests cause at most one create', async () => {
    const ctx = setup({ FAKE_GH_CREATE: 'slow-ok' });
    const [a, b] = await Promise.all([runCLIAsync(ctx, ['--live']), (async () => {
      await new Promise((r) => setTimeout(r, 300));
      return runCLIAsync(ctx, ['--live']);
    })()]);
    expect(creates(ctx)).toHaveLength(1);
    const ids = [a, b].filter((r) => r.code === 0).map((r) => JSON.parse(r.stdout).remoteId);
    expect(new Set(ids).size).toBeLessThanOrEqual(1);
    const inProgress = [a, b].find((r) => r.code === 1 && /IN_PROGRESS/.test(r.stderr));
    const dups = [a, b].filter((r) => r.code === 0 && JSON.parse(r.stdout).duplicate === true);
    expect(inProgress !== undefined || dups.length >= 1).toBe(true);
    // After settlement, a repeat returns the one recorded ID without creating.
    const third = runCLI(ctx, ['--live']);
    expect(third.code).toBe(0);
    expect(JSON.parse(third.stdout).duplicate).toBe(true);
    expect(creates(ctx)).toHaveLength(1);
  }, 60000);

  it('failed creates keep pending state and refuse blind retry', () => {
    const ctx = setup({ FAKE_GH_CREATE: 'fail' });
    const r = runCLI(ctx, ['--live']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/UNKNOWN_OUTCOME/);
    expect(r.stderr).not.toMatch(/fake gh failure/);
    expect(creates(ctx)).toHaveLength(1);
    const retry = runCLI(ctx, ['--live']);
    expect(retry.code).toBe(1);
    expect(retry.stderr).toMatch(/UNKNOWN_OUTCOME/);
    expect(creates(ctx)).toHaveLength(1);
    const status = runCLI(ctx, ['--status']);
    expect(status.code).toBe(0);
    expect(JSON.parse(status.stdout).unknown).toBe(true);
  });

  it('invalid remote IDs keep pending state without a receipt', () => {
    const ctx = setup({ FAKE_GH_CREATE: 'bad-url' });
    const r = runCLI(ctx, ['--live']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/UNKNOWN_OUTCOME/);
    const status = runCLI(ctx, ['--status']);
    expect(JSON.parse(status.stdout).receipt).toBe('missing');
    expect(JSON.parse(status.stdout).unknown).toBe(true);
  });

  it('corrupt receipts refuse without invoking gh', () => {
    const ctx = setup();
    const first = runCLI(ctx, ['--live']);
    expect(first.code).toBe(0);
    const files = readdirSync(ctx.receipts).filter((f) => f.endsWith('.receipt.json'));
    expect(files).toHaveLength(1);
    writeFileSync(join(ctx.receipts, files[0]), 'corrupt{{{', 'utf8');
    rmSync(ctx.log, { force: true });
    const r = runCLI(ctx, ['--live']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/corrupt|UNKNOWN_OUTCOME/i);
    expect(creates(ctx)).toHaveLength(0);
  });

  it('status never invokes gh and recover clears only pending state', () => {
    const ctx = setup({ FAKE_GH_CREATE: 'fail' });
    runCLI(ctx, ['--live']);
    rmSync(ctx.log, { force: true });
    const s = runCLI(ctx, ['--status']);
    expect(s.code).toBe(0);
    expect(existsSync(ctx.log)).toBe(false);
    const plan = runCLI(ctx, ['--recover']);
    expect(plan.code).toBe(0);
    expect(JSON.parse(plan.stdout).pending).toBe(true);
    const done = runCLI(ctx, ['--recover', '--confirm-recover']);
    expect(done.code).toBe(0);
    const after = runCLI(ctx, ['--status']);
    const parsed = JSON.parse(after.stdout);
    expect(parsed.unknown).toBe(false);
    expect(parsed.locked).toBe(false);
  });
});
