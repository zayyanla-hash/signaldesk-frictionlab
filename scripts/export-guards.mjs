// Pure fail-closed guards for the owner-run GitHub issue export.
// No I/O, no network, no credentials. Tested by export-guards.test.mjs.

export function isRepoFormatOk(repo) {
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo.trim());
}

/** Exact match only. Empty allowlist never matches: fail closed. */
export function isAllowlisted(repo, allowlist) {
  if (typeof repo !== 'string' || typeof allowlist !== 'string') return false;
  const r = repo.trim();
  const a = allowlist.trim();
  if (!r || !a) return false;
  return r === a;
}

/** The handoff Markdown must carry an explicit approved-state marker line. */
export function hasApprovedMarker(markdown) {
  if (typeof markdown !== 'string') return false;
  return /^\s*state:\s*approved\s*$/im.test(markdown);
}

/** Canonical preamble size (lines) where approval metadata must live. */
export const PREAMBLE_LINES = 8;

/**
 * Validate approved handoff metadata against the canonical exported structure:
 * line 1 is `# Issue: <non-empty title>`, line 3 is the single approved State
 * line, exactly one State line lives in the first PREAMBLE_LINES lines, and no
 * State lines appear anywhere else. A smuggled `State: approved` in a later
 * section must never approve a draft body.
 */
export function validatePreambleApproval(markdown) {
  const errors = [];
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return { ok: false, errors: ['Handoff Markdown is empty.'] };
  }
  const lines = markdown.split('\n');
  const trimmed = lines.map((l) => String(l).trim());
  if (!/^# Issue:\s*\S/.test(trimmed[0] ?? '')) {
    errors.push('Handoff is missing its canonical `# Issue:` heading on line 1. Re-export from an approved decision.');
  }
  const inPreamble = trimmed.slice(0, PREAMBLE_LINES).filter((l) => /^state\s*:/i.test(l));
  const everywhere = trimmed.filter((l) => /^state\s*:/i.test(l));
  if (!/^state\s*:\s*approved\s*$/i.test(trimmed[2] ?? '')) {
    errors.push('Handoff line 3 is not the approved-state marker. Approve the decision before export.');
  }
  if (inPreamble.length > 1) {
    errors.push('Handoff carries more than one State line in its preamble. Metadata is ambiguous.');
  }
  if (everywhere.length > inPreamble.length) {
    errors.push('Handoff carries State lines outside its preamble. Metadata is ambiguous.');
  }
  return { ok: errors.length === 0, errors };
}

/** Only an explicit --live (without --dry-run) resolves to live. Everything else is dry-run. */
export function resolveMode({ live, dryRun }) {
  if (live === true && dryRun !== true) return 'live';
  return 'dry-run';
}

/**
 * Fail-closed validation for any export beyond a local download.
 * Dry-run is always read-only; live requires allowlist match + approved marker + --live.
 */
export function validateExportRequest({ repo, allowlist, markdown, live, dryRun }) {
  const errors = [];
  if (typeof allowlist !== 'string' || !allowlist.trim()) {
    errors.push('Allowlist not configured: set PORTFOLIO_DEMO_REPO to your own disposable demo repo.');
  }
  if (!isRepoFormatOk(repo)) {
    errors.push('Bad --repo format: expected OWNER/REPO.');
  } else   if (!isAllowlisted(repo, allowlist ?? '')) {
    errors.push('Refusing: --repo does not match the PORTFOLIO_DEMO_REPO allowlist.');
  }
  const approval = validatePreambleApproval(markdown);
  if (!approval.ok) {
    errors.push(...approval.errors);
  }
  const mode = resolveMode({ live, dryRun });
  if (mode !== 'live') {
    errors.push('Live flag missing: pass --live to write; otherwise dry-run only, nothing is sent.');
  }
  return { ok: errors.length === 0, mode, errors };
}
