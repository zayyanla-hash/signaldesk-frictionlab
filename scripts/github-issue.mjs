#!/usr/bin/env node
// Owner-run GitHub issue export. Fail-closed by design:
//  - PORTFOLIO_DEMO_REPO must be set to your own disposable demo repo (OWNER/REPO)
//    and must exactly match --repo. Anything else refuses.
//  - The handoff Markdown must match the canonical exported structure
//    (`# Issue:` heading line 1, single approved `State:` line 3). Drafts,
//    ambiguous, or smuggled markers are refused.
//  - Nothing is sent without an explicit --live flag. --dry-run (or omitting --live)
//    only validates and prints what would happen; it never calls `gh`.
//  - Live writes verify ownership through gh's authenticated API (personal
//    user-owned repo, push access, issues enabled, not archived/disabled).
//  - The exact validated body is snapshotted and sent with --body-file, so the
//    reviewed content and the sent content cannot drift.
//  - Successful live creates store a durable local receipt (gitignored
//    `.local/issue-receipts/`) keyed by exact repo + content hash. Repeats return
//    the recorded remote ID without invoking `gh` again.
//  - Uncertain outcomes keep a durable pending lock and refuse blind retry.
//    Recover only with --recover after verifying the exact repo, title, content.
//  - Auth is enforced by `gh` itself at write time; this script never reads,
//    prints, or probes credentials, and never prints raw tool output.
//
// Usage:
//   PORTFOLIO_DEMO_REPO=OWNER/demo-repo node scripts/github-issue.mjs \
//     --repo OWNER/demo-repo --file issue-handoff.md --dry-run
//   PORTFOLIO_DEMO_REPO=OWNER/demo-repo node scripts/github-issue.mjs \
//     --repo OWNER/demo-repo --file issue-handoff.md --live
//   PORTFOLIO_DEMO_REPO=OWNER/demo-repo node scripts/github-issue.mjs \
//     --repo OWNER/demo-repo --file issue-handoff.md --status
import { readFileSync, existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  isRepoFormatOk,
  isAllowlisted,
  validatePreambleApproval,
  resolveMode,
} from './export-guards.mjs';
import { submitOnce, receiptStatus, readReceipt, receiptKey, releaseLock } from './submission-receipts.mjs';
import { verifyOwnership } from './repo-ownership.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const repo = arg('--repo');
const file = arg('--file');
const liveFlag = process.argv.includes('--live');
const dryRunFlag = process.argv.includes('--dry-run');
const statusFlag = process.argv.includes('--status');
const recoverFlag = process.argv.includes('--recover');
const confirmRecoverFlag = process.argv.includes('--confirm-recover');
const allowlist = process.env.PORTFOLIO_DEMO_REPO ?? '';
// Durable local duplicate record (gitignored). Override only for tests.
const receiptDir = process.env.PORTFOLIO_RECEIPT_DIR || '.local/issue-receipts';

if (!repo || !file) {
  console.error('Usage: PORTFOLIO_DEMO_REPO=OWNER/demo-repo node scripts/github-issue.mjs --repo OWNER/demo-repo --file issue-handoff.md [--dry-run | --live | --status | --recover [--confirm-recover]]');
  process.exit(2);
}
if (!isRepoFormatOk(repo)) {
  console.error('Refusing: --repo must look like OWNER/REPO.');
  process.exit(2);
}
if (!allowlist.trim()) {
  console.error('Refusing: PORTFOLIO_DEMO_REPO is not set. Set it to your own disposable demo repo (OWNER/REPO).');
  process.exit(2);
}
if (!isAllowlisted(repo, allowlist)) {
  console.error('Refusing: --repo does not match the PORTFOLIO_DEMO_REPO allowlist. Configure only a verified, user-owned disposable demo repo.');
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(2);
}
const body = readFileSync(file, 'utf8');
const title = (body.split('\n')[0] || 'FrictionLab handoff').replace(/^#\s*/, '').slice(0, 120);
if (!title.trim() || body.trim().length < 20) {
  console.error('Refusing: handoff file looks empty.');
  process.exit(2);
}
const approval = validatePreambleApproval(body);
if (!approval.ok) {
  console.error(`Refusing: ${approval.errors.join(' ')}`);
  process.exit(2);
}

const mode = resolveMode({ live: liveFlag, dryRun: dryRunFlag });
if (mode !== 'live' && !statusFlag && !recoverFlag) {
  console.log(JSON.stringify({ repo, title, chars: body.length, mode: 'dry-run', allowlistMatched: true, approved: true }, null, 2));
  process.exit(0);
}

if (statusFlag) {
  // Read-only reconciliation status: reports local receipt/lock/unknown state
  // for this exact repo + content. Never invokes gh.
  const status = receiptStatus({ dir: receiptDir, repo, title, body });
  console.log(JSON.stringify({ repo, title, mode: 'status', ...status }, null, 2));
  process.exit(0);
}

if (recoverFlag) {
  // Manual recovery after an uncertain outcome. Never invokes gh and never
  // touches success receipts: run ONLY after verifying in the demo repository
  // that no such issue exists (same repo, title, and content).
  const status = receiptStatus({ dir: receiptDir, repo, title, body });
  if (!confirmRecoverFlag) {
    console.log(JSON.stringify({
      repo, title, mode: 'recover', pending: true, ...status,
      instructions: 'Verify the exact repo, title, and content in the demo repository. If no such issue exists, rerun with --confirm-recover to clear the pending lock and unknown marker. Success receipts are never cleared by recovery.',
    }, null, 2));
    process.exit(0);
  }
  const key = receiptKey({ repo, title, body });
  releaseLock({ dir: receiptDir, key });
  try {
    rmSync(join(receiptDir, `${key}.unknown.json`), { force: true });
  } catch {
    // best effort; status will show the remainder
  }
  const after = receiptStatus({ dir: receiptDir, repo, title, body });
  console.log(JSON.stringify({ repo, title, mode: 'recover', pending: false, ...after }, null, 2));
  process.exit(0);
}

// A recorded success returns before any gh or auth call.
{
  const prior = readReceipt({ dir: receiptDir, key: receiptKey({ repo, title, body }) });
  if (prior.status === 'ok' && prior.receipt.repo === repo) {
    console.log(JSON.stringify({ repo, title, mode: 'live', duplicate: true, remoteId: prior.receipt.remoteId, note: 'Already submitted; gh was not invoked again.' }, null, 2));
    process.exit(0);
  }
  if (prior.status === 'corrupt') {
    console.error('Refusing: stored receipt is invalid or corrupt. Verify the exact repo, title, and content in the demo repository before any manual recovery. Never blindly retry a create.');
    process.exit(1);
  }
}

// Ownership and safety verification through gh's authenticated API.
// `gh api --jq` emits raw values for scalar projections, so the login is read
// as a trimmed raw string; the repo projection is parsed as JSON. No tokens
// are read or printed; failures report actionable safe codes only.
let authLogin;
let repoInfo;
try {
  const userOut = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  authLogin = String(userOut).trim();
  if (!authLogin) throw new Error('empty login');
  const repoOut = execFileSync(
    'gh',
    ['api', `repos/${repo}`, '--jq', '{full_name, owner: {login: .owner.login, type: .owner.type}, permissions, has_issues, archived, disabled}'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  repoInfo = JSON.parse(repoOut);
} catch {
  console.error('AUTH_FAILED: gh could not verify the authenticated user or repository. Check `gh` authentication and network access; nothing was recorded.');
  process.exit(1);
}
const ownership = verifyOwnership({ repo, authLogin, repoInfo });
if (!ownership.ok) {
  ownership.errors.forEach((e) => console.error(`${e.code}: ${e.message}`));
  console.error('Refusing live write: repository ownership or safety checks failed. Nothing was recorded.');
  process.exit(1);
}

// Snapshot the exact validated body and send the snapshot: the reviewed
// content and the sent content cannot drift even if the source file changes.
const snapshotKey = receiptKey({ repo, title, body });
const snapshotPath = join(receiptDir, `${snapshotKey}.body.md`);
try {
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(snapshotPath, body, 'utf8');
} catch {
  console.error('SNAPSHOT_FAILED: could not save the exact validated body snapshot. Nothing was sent.');
  process.exit(1);
}

try {
  const result = submitOnce({
    dir: receiptDir,
    repo,
    title,
    body,
    runCreate: () =>
      execFileSync('gh', ['issue', 'create', '--repo', repo, '--title', title, '--body-file', snapshotPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
  });
  console.log(JSON.stringify({
    repo,
    title,
    mode: 'live',
    duplicate: result.duplicate,
    remoteId: result.remoteId,
    ...(result.duplicate ? { note: 'Already submitted; gh was not invoked again.' } : { note: 'Receipt recorded locally; repeats return this remote ID.' }),
  }, null, 2));
} catch (e) {
  const code = (e && e.code) || 'UNKNOWN_OUTCOME';
  if (code === 'IN_PROGRESS') {
    console.error('IN_PROGRESS: another submission for this exact content appears to be in flight. Do not retry automatically; run --status, verify the repository, and recover manually only once settled.');
  } else {
    console.error(`${code}: remote outcome uncertain. The issue may already exist; never blindly retry. Run --status and follow manual reconciliation.`);
  }
  process.exit(1);
}
