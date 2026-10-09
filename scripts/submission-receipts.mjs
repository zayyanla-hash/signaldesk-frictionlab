// Durable local receipts for the owner-run GitHub issue export.
// Concurrency model (single machine): an exclusive lock directory is claimed
// before any remote create, so two concurrent identical requests cause at most
// one create. Success receipts are written atomically (temp file + rename) and
// the returned github.com issue URL is validated against the exact repo.
// A corrupt receipt or an unknown outcome never triggers another blind create:
// both refuse with an actionable code and manual-reconciliation guidance.
// No network and no credentials here; `gh` itself enforces auth at write time.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Stable key over the exact allowlisted repo + title + approved content. */
export function receiptKey({ repo, title, body }) {
  return createHash('sha256')
    .update(`${repo}\n${title}\n${body}`, 'utf8')
    .digest('hex');
}

export function receiptPath(dir, key) {
  return join(dir, `${key}.receipt.json`);
}

function lockPath(dir, key) {
  return join(dir, `${key}.lock`);
}

function journalPath(dir, key) {
  return join(lockPath(dir, key), 'journal.json');
}

function unknownPath(dir, key) {
  return join(dir, `${key}.unknown.json`);
}

/**
 * The returned issue URL must be a github.com issue URL for the exact repo:
 * https://github.com/OWNER/REPO/issues/N (owner/repo matched case-insensitively,
 * numeric issue id). Anything else is rejected and recorded nowhere.
 */
export function validateIssueUrl(url, repo) {
  if (typeof url !== 'string') return { ok: false };
  const m = url.trim().match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)\s*$/i);
  if (!m) return { ok: false };
  const [owner, name] = repo.split('/');
  if (!owner || !name) return { ok: false };
  if (m[1].toLowerCase() !== owner.toLowerCase() || m[2].toLowerCase() !== name.toLowerCase()) {
    return { ok: false };
  }
  return { ok: true, issueNumber: Number(m[3]) };
}

/** Read a success receipt. Corrupt files report corrupt (never a silent miss). */
export function readReceipt({ dir, key }) {
  const path = receiptPath(dir, key);
  if (!existsSync(path)) return { status: 'missing' };
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'));
    if (!r || typeof r !== 'object') return { status: 'corrupt' };
    if (typeof r.repo !== 'string' || typeof r.remoteId !== 'string' || !r.remoteId.trim()) {
      return { status: 'corrupt' };
    }
    if (typeof r.contentHash !== 'string' || r.contentHash !== key) return { status: 'corrupt' };
    // The stored remote ID must itself be a valid issue URL for the stored
    // exact repo. A malformed receipt fails closed: it never reads as success.
    if (!validateIssueUrl(r.remoteId, r.repo).ok) return { status: 'corrupt' };
    return { status: 'ok', receipt: r };
  } catch {
    return { status: 'corrupt' };
  }
}

export function readUnknownMarker({ dir, key }) {
  const path = unknownPath(dir, key);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { corrupt: true };
  }
}

/**
 * Claim the exclusive per-request lock. mkdir is atomic: exactly one of two
 * concurrent claimants wins. No age-based expiry and no automatic retry: a
 * held lock means another attempt may be in flight.
 */
export function acquireLock({ dir, key, repo }) {
  mkdirSync(dir, { recursive: true });
  try {
    mkdirSync(lockPath(dir, key));
  } catch (e) {
    if (e && e.code === 'EEXIST') return { acquired: false };
    throw e;
  }
  try {
    writeFileSync(journalPath(dir, key), JSON.stringify({ repo, key, startedAt: new Date().toISOString() }), 'utf8');
  } catch {
    // Journal is best-effort diagnostics; the lock itself is the claim.
  }
  return { acquired: true };
}

export function releaseLock({ dir, key }) {
  rmSync(lockPath(dir, key), { recursive: true, force: true });
}

/** Persist a success receipt atomically (temp file + rename). Throws on failure. */
export function recordReceipt({ dir, repo, title, body, remoteId, key, createdAt }) {
  const k = key ?? receiptKey({ repo, title, body });
  const receipt = {
    repo,
    title,
    contentHash: k,
    remoteId: String(remoteId).trim(),
    createdAt: createdAt ?? new Date().toISOString(),
  };
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `${k}.receipt.tmp-${process.pid}`);
  writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  try {
    renameSync(tmp, receiptPath(dir, k));
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // ignore cleanup failure
    }
    throw e;
  }
  return receipt;
}

/** Best-effort unknown-outcome marker: create succeeded (or may have) but no receipt exists. */
export function markUnknownOutcome({ dir, repo, title, key, reason }) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      unknownPath(dir, key),
      JSON.stringify({ repo, title, contentHash: key, reason, at: new Date().toISOString() }, null, 2),
      'utf8'
    );
    return true;
  } catch {
    return false;
  }
}

export function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

export const UNKNOWN_GUIDANCE =
  'Outcome unknown: verify the exact repo, title, and content in the demo repository before any manual recovery. Never blindly retry a create.';

/**
 * Re-check verified state while holding the acquired lock, BEFORE any remote
 * invocation. Closes the lock/receipt race: another process may have completed
 * (and released) between our initial read and our lock acquisition. A newly
 * completed receipt returns as a duplicate; newly appeared uncertainty refuses.
 * Returns null when it is safe to proceed, otherwise a duplicate result.
 * Throws UNKNOWN_OUTCOME on corrupt/unknown state.
 */
export function recheckLockedRequest({ dir, key, repo }) {
  const reread = readReceipt({ dir, key });
  if (reread.status === 'ok' && reread.receipt.repo === repo) {
    return { duplicate: true, remoteId: reread.receipt.remoteId, key };
  }
  if (reread.status === 'corrupt' || readUnknownMarker({ dir, key }) !== null) {
    throw codedError('UNKNOWN_OUTCOME', `Request state changed under lock to an uncertain outcome. ${UNKNOWN_GUIDANCE}`);
  }
  return null;
}

/**
 * Create once with interprocess duplicate prevention. `runCreate` performs the
 * single remote invocation and returns the issue URL.
 *
 * Fail-closed recovery model: the lock (pending claim) is persisted BEFORE
 * invocation and is released ONLY after a validated success receipt exists.
 * Every uncertain outcome — a thrown create, an invalid remote ID, a receipt
 * write failure — keeps the pending lock, records an unknown-outcome marker,
 * and throws UNKNOWN_OUTCOME. Nothing auto-retries; recovery is manual via
 * --status/--recover after verifying the exact repo, title, and content.
 */
export function submitOnce({ dir, repo, title, body, runCreate }) {
  const key = receiptKey({ repo, title, body });

  const existing = readReceipt({ dir, key });
  if (existing.status === 'ok' && existing.receipt.repo === repo) {
    return { duplicate: true, remoteId: existing.receipt.remoteId, key };
  }
  if (existing.status === 'corrupt') {
    throw codedError('UNKNOWN_OUTCOME', `Stored receipt is invalid or corrupt. ${UNKNOWN_GUIDANCE}`);
  }
  if (readUnknownMarker({ dir, key }) !== null) {
    throw codedError('UNKNOWN_OUTCOME', `A previous attempt left an unknown outcome. ${UNKNOWN_GUIDANCE}`);
  }

  const lock = acquireLock({ dir, key, repo });
  if (!lock.acquired) {
    // A sibling attempt may have just finished: re-check before refusing.
    const reread = readReceipt({ dir, key });
    if (reread.status === 'ok' && reread.receipt.repo === repo) {
      return { duplicate: true, remoteId: reread.receipt.remoteId, key };
    }
    throw codedError(
      'IN_PROGRESS',
      'Another submission for this exact content appears to be in flight. Do not retry automatically; check the repository, then rerun once it is settled.'
    );
  }

  // Pending is now durable (lock dir + journal). Re-verify under the lock
  // before invoking: a sibling may have completed between our first read
  // and this acquisition. The lock is released only after validated success.
  const settled = recheckLockedRequest({ dir, key, repo });
  if (settled) {
    releaseLock({ dir, key });
    return settled;
  }

  let remoteId;
  try {
    remoteId = runCreate();
  } catch {
    markUnknownOutcome({ dir, repo, title, key, reason: 'remote create threw; the remote may have accepted the issue first' });
    throw codedError(
      'UNKNOWN_OUTCOME',
      `Remote create failed with an uncertain outcome: the issue may already exist. ${UNKNOWN_GUIDANCE}`
    );
  }
  if (!validateIssueUrl(remoteId, repo).ok) {
    markUnknownOutcome({ dir, repo, title, key, reason: 'remote returned a value that is not a valid issue URL for the exact repo' });
    throw codedError(
      'UNKNOWN_OUTCOME',
      `Remote returned an invalid issue URL, but the issue may already exist. ${UNKNOWN_GUIDANCE}`
    );
  }
  try {
    const receipt = recordReceipt({ dir, repo, title, body, remoteId: String(remoteId).trim(), key });
    releaseLock({ dir, key });
    return { duplicate: false, remoteId: receipt.remoteId, key };
  } catch {
    markUnknownOutcome({ dir, repo, title, key, reason: 'receipt write failed after a remote response' });
    throw codedError(
      'UNKNOWN_OUTCOME',
      `Remote may have succeeded but the receipt could not be persisted. ${UNKNOWN_GUIDANCE}`
    );
  }
}

/** Read-only status for reconciliation: never invokes any remote. */
export function receiptStatus({ dir, repo, title, body }) {
  const key = receiptKey({ repo, title, body });
  const receipt = readReceipt({ dir, key });
  const unknown = readUnknownMarker({ dir, key });
  const locked = existsSync(lockPath(dir, key));
  return { key, receipt: receipt.status, unknown: unknown !== null, locked };
}
