# Verification

How to verify this repo's claims yourself, and what the current checks cover.
Run the commands below in the project directory; they are the source of
truth, not the numbers quoted here (which will go stale as the code changes).

## Commands

```sh
npm ci              # clean install from the lockfile
npm run lint         # eslint flat config
npm run typecheck    # tsc --noEmit
npm test             # vitest unit suite
npm run build        # production bundle in dist/
npm audit            # dependency vulnerability scan
npm run test:e2e      # browser workflow suite against the dev server
npm run test:e2e:prod # same suite against the built dist/ bundle
```

At the time of this pass: `npm test` reported 21 files / 163 tests passing,
`npm run lint` and `npm run typecheck` were clean, `npm run build` produced a
working `dist/`, and `npm audit` reported 0 vulnerabilities. Re-run the
commands for current numbers.

## What the automated suite covers

- **lib** (csv/datetime/utils/storage): record-level CSV parsing (multiline,
  escapes, CRLF/BOM, duplicate headers, row width, malformed quoting,
  physical row numbers, size bounds), strict UTC timestamps with explicit
  timezones, hostname/URL validation, a hardened CSV-formula guard, and
  versioned validated storage with visible recovery and sticky save errors.
- **signaldesk** (scoring/export/csvImport/migration/researched/storageGuards):
  deterministic scoring, component sums, exclusion override, bounded 0-100
  totals under hostile weights (100s, NaN, negatives, extreme values),
  weight/criteria validation, URL/date strictness, missing-evidence zeroing,
  user-assertion labeling, criteria-aware eligible exports,
  provenance-preserving briefs, and safe storage migration.
- **frictionlab** (analytics/evidence/feedbackImport/githubAdapter): fixture
  counts for a fixed-window funnel, event/account quarantine units, feedback
  import quarantine (duplicates, timezones, future dates, unjoinable rows),
  theme-edit approval invalidation, and the mock GitHub adapter's labeled
  simulation and failure handling.
- **scripts** (export-guards/repo-ownership/submission-receipts/serve-dist/
  hosting-config/github-issue-live): the owner-run CLI's allowlist, canonical
  approval check, ownership rules, locked/atomic receipts with
  unknown-outcome refusal, and static-hosting config consistency across
  Netlify/Vercel/the local fixture. The live-write tests run against a fake
  `gh` binary — no real network calls.

## Browser checks

- `npm run test:e2e` and `npm run test:e2e:prod` drive the app with Playwright
  against sandboxed, explicitly non-sandbox-bypassed system Chrome, at
  desktop and mobile widths. They assert behavior (not just that pages
  render): home + skip-link keyboard reachability, researched vs synthetic
  brief resolution, provenance labels, safe external-link attributes, dataset
  switching, exclusion propagation into exports, CSV quarantine, storage
  persistence across reload, and zero horizontal overflow.
- `npm run test:e2e:prod` additionally runs those workflows through the built
  `dist/` bundle behind the same headers (CSP, no-store on the entry
  document) that a static host would serve.
- Screenshots in `.e2e-shots/` are test *output*, not substitutes for the
  assertions above; the directory is gitignored.

## Security and privacy

- No committed secrets; no `fetch`, XHR, WebSocket, EventSource, beacons, or
  forms anywhere in `src/` — the bundle has no reachable external request
  target.
- No `dangerouslySetInnerHTML`; feedback and CSV imports render as text.
  Source links render as anchors only for validated `http(s)` URLs, with
  `target="_blank" rel="noopener"`.
- CSV exports pass through a hardened `csvSafe` helper (formula triggers,
  leading whitespace, control characters).
- `scripts/github-issue.mjs` is owner-run only; it never prints raw tool
  output or tokens. No live write has been performed from this repo — all
  live-path tests use a fake `gh` binary.
- Production CSP (verified against the built bundle): `default-src 'self';
  base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src
  'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src
  'self'; connect-src 'none'; form-action 'none'`. The `unsafe-inline` style
  allowance exists because React renders some inline `style` attributes
  (progress-bar widths); there are no inline `<script>` tags in the output.

## Provenance

- SignalDesk default: 12 researched webhook vendors
  (`src/signaldesk/researchPacket.json`), each signal sourced to a primary
  documentation URL with a retrieval date (publication dates are often
  unknown and shown as such). All start in review with unknown
  headcount/geography and a six-capability documentation-coverage fit score
  (`src/signaldesk/fitResearch.json`). Sources document capabilities, never
  purchasing demand.
- A separate 20-account synthetic sample (fictional `.example` domains, no
  public citations) sits one toggle away.
- FrictionLab: a seeded generator (mulberry32, seed 42), fixed snapshot, and
  a 7-day activation window. Built-in records are synthetic; imports are
  user-provided and unverified.

## Residuals and limits (honest)

- FrictionLab's live GitHub integration is implemented but unverified end to
  end: no authorized demo repository, no real `gh` calls outside tests.
  Exactly-once delivery across network failures is not promised.
- SignalDesk's researched evidence covers webhook capabilities only — no
  demand, budget, buyer, or headcount signal is established for any vendor.
- `npm run preview` is a local dev convenience only, never a production
  server.
- Browser e2e requires a local Chrome install and free ports; it has not been
  run against Safari or Firefox.
