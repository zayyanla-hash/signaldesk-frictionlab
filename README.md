# SignalDesk + FrictionLab

By Zayyan Latif. **Live demo:** https://zayyan-portfolio-labs-ascend4.vercel.app (no sign-in, opens on example data).

Two small, working tools, built to show how I think about GTM and product
problems, not slideware.

- **SignalDesk** (`/signaldesk`): evidence-backed GTM account prioritization
  with sourced-fact account briefs, for RelayWatch, a fictional
  integration-monitoring product.
- **FrictionLab** (`/frictionlab`): onboarding-funnel diagnostics, evidence-linked
  feedback, and a reviewed issue handoff.

Both open on populated example data. No login, upload, API key, or live
service required. Everything runs locally in the browser: nothing is sent
anywhere, and anything you import or edit stays on this device.

## Try this in 60 seconds

- **SignalDesk:** open `/signaldesk`, change a scoring weight in Target and
  Data, and watch the ranking move. Open a researched account brief, then
  switch the dataset toggle to the synthetic sample and approve + export one.
- **FrictionLab:** open `/frictionlab`, look at the funnel's drop-off step,
  then open Evidence to see the linked feedback behind it. Paste a broken
  events CSV and watch rows get quarantined with reasons.

## Honest limits

- SignalDesk's default dataset is **12 researched webhook vendors**, sourced
  from each vendor's own public documentation (URL + retrieval date per
  signal). A separate, clearly labeled **20-account synthetic sample** sits
  one switch away. Researched sources document product capabilities, not
  purchasing intent: fit is a six-capability documentation-coverage heuristic
  (signature verification, retry policy, delivery logs, manual redelivery,
  event filtering, local testing), not a purchase probability. Missing
  evidence scores 0; hard exclusions override scores and never enter the
  approved export.
- FrictionLab's funnel and feedback are entirely **synthetic**, from a seeded
  generator with a fixed snapshot: the numbers are the same every run.
  CSV imports are labeled user-provided and unverified. A funnel drop next to
  a few complaints is a lead, not a cause.
- FrictionLab's GitHub handoff in this public demo is a **mock**: a
  validation-only adapter plus a labeled simulation. No live GitHub write
  happens from the hosted demo.
- No secrets are committed, no credentials ship in the bundle, and the app
  makes no outbound network requests.

## Run and test

Requires Node ^24.0.0 || >=26.0.0.

```sh
npm ci
npm run dev           # local dev server
npm test              # unit suite (vitest)
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run build         # production bundle in dist/
npm run test:e2e      # browser workflows against the dev server
npm run test:e2e:prod # same workflows against the built dist/ bundle
```

Run `npm test` and `npm run test:e2e` yourself for current pass counts: they
change as the apps evolve, so this file does not hardcode a number that can
go stale.

## Stack

React 19, Vite, TypeScript, Tailwind CSS v4, React Router, DM Sans (plus
Inter and Geist/Geist Mono for the product screens). See
`THIRD_PARTY_NOTICES.md` for ported MIT components, CC0 icons, and font
licenses.

## Structure

```
src/
  App.tsx, main.tsx, styles.css, components/      # portfolio shell, Home, 404, shared UI
  lib/                  # csv (record parser), datetime (strict UTC), storage (validated), utils
  signaldesk/           # scoring, sampleData (20 synthetic accounts),
                        # researchPacket.json + researched.ts (12 sourced vendors), screens
  frictionlab/          # analytics (7-day funnel contract), generator (seed 42),
                        # feedbackImport, evidence helpers, githubAdapter, screens
scripts/github-issue.mjs         # owner-run export: allowlist, approval check, explicit --live
scripts/submission-receipts.mjs  # locked, atomic local receipts
scripts/export-guards.mjs        # approval, allowlist, and explicit-live checks
scripts/repo-ownership.mjs       # ownership verification against gh API data
scripts/serve-dist.mjs           # loopback-only dist fixture with production headers
scripts/e2e.mjs / e2e-prod.mjs    # browser workflow suites (dev bundle / prod bundle)
netlify.toml, vercel.json, public/_redirects   # static hosting configs
```

## Data schemas (imports)

SignalDesk CSV: `company, domain, source_url, source_date, evidence_text, tags`.
Domains must be bare valid hostnames; URLs must be complete http(s) with a
valid hostname; dates must be real calendar dates (unknown stays unknown).
Quoted multiline fields, CRLF, and BOM are supported; malformed records
quarantine with physical row numbers.

FrictionLab `events.csv`: `event_id, account_id, event_name, occurred_at`
with an explicit timezone (Z or +HH:MM). `feedback.csv`: `feedback_id,
account_id, text, received_at`, same rule. Invalid, future, unjoinable,
duplicate, and empty rows quarantine with reasons.

## Credits

Built with AI coding assistants under my direction; product decisions,
research standards and review are mine.
