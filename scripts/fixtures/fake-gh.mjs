#!/usr/bin/env node
// Local fake `gh` for CLI integration tests. Never touches the network.
// Models real output shapes: `api --jq .login` emits a RAW login line (not
// JSON), while object projections emit JSON. Behaviors are driven by env:
//   FAKE_GH_LOGIN      login printed for `api user` (default "owner")
//   FAKE_GH_REPO_JSON  JSON printed for `api repos/...` (default good repo)
//   FAKE_GH_CREATE     ok | slow-ok | fail | bad-url  (default ok)
//   FAKE_GH_LOG        file every invocation appends a JSON line to
import { appendFileSync, readFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function defaultRepo(path) {
  const m = /^repos\/([^/]+)\/([^/]+)$/.exec(path) || [];
  return JSON.stringify({
    full_name: `${m[1] ?? 'owner'}/${m[2] ?? 'demo-repo'}`,
    owner: { login: m[1] ?? 'owner', type: 'User' },
    permissions: { push: true, admin: false },
    has_issues: true,
    archived: false,
    disabled: false,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const entry = { args };
  if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify({ ...entry, phase: 'start' })}\n`);
  if (args[0] === 'api' && args[1] === 'user') {
    process.stdout.write(`${process.env.FAKE_GH_LOGIN ?? 'owner'}\n`);
    return;
  }
  if (args[0] === 'api' && args[1] && args[1].startsWith('repos/')) {
    process.stdout.write(`${process.env.FAKE_GH_REPO_JSON ?? defaultRepo(args[1])}\n`);
    return;
  }
  if (args[0] === 'issue' && args[1] === 'create') {
    const bi = args.indexOf('--body-file');
    const ri = args.indexOf('--repo');
    const repo = ri >= 0 ? args[ri + 1] : 'unknown/repo';
    const body = bi >= 0 ? readFileSync(args[bi + 1], 'utf8') : null;
    if (process.env.FAKE_GH_LOG) {
      appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify({ args, repo, bodyChars: body === null ? null : body.length, body })}\n`);
    }
    const mode = process.env.FAKE_GH_CREATE ?? 'ok';
    if (mode === 'slow-ok') await sleep(2500);
    if (mode === 'fail') {
      process.stderr.write('fake gh failure\n');
      process.exit(1);
    }
    if (mode === 'bad-url') {
      process.stdout.write('created-something-unparseable\n');
      return;
    }
    process.stdout.write(`https://github.com/${repo}/issues/7\n`);
    return;
  }
  process.stderr.write(`fake-gh: unsupported invocation: ${args.join(' ')}\n`);
  process.exit(2);
}

main().catch((e) => {
  process.stderr.write(`fake-gh crashed: ${String((e && e.message) || e)}\n`);
  process.exit(2);
});
