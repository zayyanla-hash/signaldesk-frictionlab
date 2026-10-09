// Ownership verification for the owner-run issue export, evaluated against data
// returned by gh's authenticated API at live write time. Pure functions only:
// the CLI supplies fetchers, tests supply fixtures, and no tokens are read,
// printed, or probed here.

/**
 * Verify that `repo` (OWNER/NAME) is a personal user-owned repository of the
 * authenticated user with push access, open issues, and no archived/disabled
 * state. Rejects missing, wrong, ambiguous, or unsafe configurations.
 */
export function verifyOwnership({ repo, authLogin, repoInfo }) {
  const errors = [];
  const fail = (code, message) => errors.push({ code, message });
  if (typeof repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repo.trim())) {
    return { ok: false, errors: [{ code: 'BAD_FORMAT', message: 'Repository must look like OWNER/NAME.' }] };
  }
  if (typeof authLogin !== 'string' || !authLogin.trim()) {
    fail('AUTH_FAILED', 'Could not determine the authenticated user.');
  }
  const info = repoInfo && typeof repoInfo === 'object' ? repoInfo : null;
  if (!info) {
    fail('NOT_FOUND', 'Repository metadata is unavailable; the repo may not exist or may be unreachable.');
    return { ok: false, errors };
  }
  const fullName = typeof info.full_name === 'string' ? info.full_name : '';
  const [wantOwner, wantName] = repo.split('/');
  if (fullName.toLowerCase() !== `${wantOwner}/${wantName}`.toLowerCase()) {
    fail('NOT_FOUND', 'Repository canonical name does not match the requested repo.');
  }
  const owner = info.owner && typeof info.owner === 'object' ? info.owner : {};
  if (owner.type !== 'User') {
    fail('NOT_PERSONAL', 'Only personal user-owned repositories are allowed; organizations are refused.');
  }
  if (
    typeof owner.login !== 'string' ||
    typeof authLogin !== 'string' ||
    owner.login.toLowerCase() !== authLogin.toLowerCase()
  ) {
    fail('NOT_OWNER', 'Repository owner does not match the authenticated user.');
  }
  const perms = info.permissions && typeof info.permissions === 'object' ? info.permissions : {};
  if (perms.push !== true && perms.admin !== true) {
    fail('NO_WRITE_ACCESS', 'Authenticated user lacks push/admin permission on this repository.');
  }
  // Fail closed on missing metadata: an absent flag is never treated as safe.
  const missing = [];
  if (typeof info.has_issues !== 'boolean') missing.push('has_issues');
  if (typeof info.archived !== 'boolean') missing.push('archived');
  if (typeof info.disabled !== 'boolean') missing.push('disabled');
  if (missing.length > 0) {
    fail('INCOMPLETE_METADATA', `Repository metadata is missing: ${missing.join(', ')}. Refusing without explicit safety flags.`);
  } else {
    if (info.has_issues !== true) {
      fail('ISSUES_DISABLED', 'Repository has issues disabled.');
    }
    if (info.archived !== false) {
      fail('ARCHIVED', 'Repository is archived.');
    }
    if (info.disabled !== false) {
      fail('DISABLED', 'Repository is disabled.');
    }
  }
  return { ok: errors.length === 0, errors };
}
